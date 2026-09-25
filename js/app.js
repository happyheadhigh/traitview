/* TraitView extracted app logic.
   Generated from index.html by tools/split-index.mjs.
   Classic script on purpose so existing inline onclick handlers still work. */

// jv: "Why do svg token images look like this in screenshots? Even
// when I use the grid download they look like this." Pixel-art SVGs
// (a grid of small <rect> elements, one per "pixel" -- how a lot of
// fully on-chain generative art like this is stored) are still vector
// and should never blur regardless of scale, but the browser's default
// SVG rasterization anti-aliases the boundary between adjacent rects
// whenever the rendered size isn't a clean integer multiple of the
// viewBox -- essentially always true for a responsive, variable-width
// container. shape-rendering: crispEdges is the SVG equivalent of
// image-rendering: pixelated for raster images -- tells the renderer
// to snap edges to pixel boundaries instead of anti-aliasing them.
// Injected directly into the svg tag itself (not relying on CSS on
// whatever ends up displaying it) so it's baked in however this string
// is later used: shown live inline, loaded as an <img> via a data URI,
// or (js/downloads.js's own identical copy of this same function,
// needed there too since that file is lazy-loaded on demand and can't
// be relied on being present yet whenever a token image is first
// displayed) drawn to a canvas for the grid download.
// A token image served by the bot's /db/token-image endpoint as SVG
// (lazy-image collections; see /db/all-traits?lazyImages=1). Defined here,
// not in downloads.js, because that file is lazy-loaded and the token
// modal's SVG-button check runs before any download has happened.
// jv: "after the deploy the images dont load again. probably not until i
// visit the site for another time or 2". A plain <img> that fails once
// stays broken forever -- the browser never retries. Token images now come
// from the bot's /db/token-image endpoint, so any blip (a bot redeploy on
// Railway, a timeout) left those tiles blank until a later visit. One
// capture-phase listener retries any failed token-image load up to 4 times
// with growing waits (0.8s, 3.2s, 7.2s, 12.8s), cache-busting each retry.
// jv: OCAS "took an awhile to populate all images" and some never did ("?"
// icons). OCAS images mostly come through the public ipfs.io gateway,
// which is slow and rate-limits bursts; a refused <img> never retries. Now
// covers ALL token images: served token images (/db/token-image) and IPFS
// images, which also rotate to a different public gateway each retry (a
// rate limit on one doesn't affect the others). Other images untouched.
const _TV_IPFS_GATEWAYS = ['https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/', 'https://w3s.link/ipfs/', 'https://gateway.pinata.cloud/ipfs/'];
document.addEventListener('error', e => {
  const img = e.target;
  if(!img || img.tagName !== 'IMG') return;
  const src = img.getAttribute('src') || '';
  const isServed = src.includes('/db/token-image?');
  const ipfsMatch = src.match(/^https?:\/\/[^/]+\/ipfs\/(.+)$/);
  if(!isServed && !ipfsMatch) return;
  const n = +(img.dataset.tiRetry || 0);
  if(n >= 4) return;
  img.dataset.tiRetry = String(n + 1);
  setTimeout(() => {
    if(!img.isConnected) return;
    if(ipfsMatch){
      const gw = _TV_IPFS_GATEWAYS[(n + 1) % _TV_IPFS_GATEWAYS.length];
      img.src = gw + ipfsMatch[1].replace(/[?&]_r=\d+$/, '');
    } else {
      img.src = src.replace(/&_r=\d+/, '') + '&_r=' + (n + 1);
    }
  }, 800 * (n + 1) * (n + 1));
}, true);

function _isServedSvgUrl(v){
  if(typeof v !== 'string') return false;
  if(v.includes('/db/token-image?') && /[?&]fmt=svg(&|$)/.test(v)) return true;
  return /\/data\/img\/\d+\.svg(\?|$)/.test(v);   // OCAS per-token static SVGs
}

function _svgCrisp(svgText){
  const s = String(svgText || '');
  if(!s.startsWith('<svg')) return s;
  if(/\sshape-rendering\s*=/.test(s.slice(0, 300))) return s; // already set, don't duplicate
  return s.replace(/^<svg/, '<svg shape-rendering="crispEdges"');
}

/* Must run before anything else in this file -- confirmed live that several
   functions execute unconditionally at the top level of this script
   (loadBurnTicker(), syncFavoritesUI(), further down), before init() ever
   runs at the bottom. Those depend on LIVE_SLUG/LIVE_CONTRACT/RAILWAY_API/
   RAILWAY_KEY (via dbFetch/favoriteKeyFor), which start out null until
   activateCollection() sets them -- so this has to run here, at the very
   top, not inside init() where it was originally placed. Safe to touch the
   DOM-adjacent globals this sets even this early since config.js/api.js/
   favorites.js all load with `defer` before this script does, and this
   itself doesn't touch the DOM, only global state. Falls back to
   DEFAULT_COLLECTION_SLUG (OCAS) for a bare traitview.com visit with no
   ?collection= or /token/:slug/:id in the URL, matching every existing
   bookmark/link's current behavior unchanged. */
activateCollection(collectionSlugFromUrl());

/* Runs in parallel with everything else below -- see the detailed
   reasoning on loadDynamicCollections() itself in config.js for why this
   can't be awaited here. Two things happen once it resolves: (1) if the
   URL asked for a collection that wasn't in the hardcoded baseline above
   (so activateCollection() just silently fell back to the default one),
   and it turns out to be a real, newly-onboarded collection, actually
   switch to it now -- late, but correct, rather than silently stuck on
   the wrong collection for the rest of the session. (2) either way,
   refresh the collection-switcher dropdown so anything discovered this
   way is pickable by hand too, not just reachable by a direct link. */
(function(){
  const requestedSlug = collectionSlugFromUrl();
  // jv: "The last wallet I connected with is the wallet that hold
  // argonauts and that is the only wallet be recognized by the site...
  // it needs to be able to recognize ALL wallets linked to my discord
  // ID." Traced this to the exact same race documented in the comment
  // right above -- for a dynamically-discovered collection like nekoadz
  // (not in the hardcoded baseline), activateCollection() initially
  // falls back to OCAS's contract/chain, and only corrects itself once
  // this fetch resolves. initTraitViewWallet() (walletConnect.js) runs
  // on the very early DOMContentLoaded event and used to run its
  // wallet-restore/linked-wallet-combining logic immediately -- well
  // before this fetch had a chance to complete, so on a fresh nekoadz
  // page load it checked holdings against OCAS's contract instead, for
  // every wallet involved, and never got a chance to redo itself once
  // the real collection loaded in. Exposed as an awaitable promise
  // (matching window._allTraitsPromise's own established pattern) so
  // that wallet-restore logic can wait for the real collection to be
  // active before ever checking a single wallet's holdings.
  // jv: landing page loading slowly on a hotspot. Opening a collection
  // from the landing page is a full page load (?collection=slug), where
  // everything below starts fresh anyway -- so on the landing page this
  // was pure background traffic competing with the landing cards. The
  // landing page already calls loadDynamicCollections() itself; this was
  // a duplicate /db/collections request.
  if(window.__TV_LANDING__) return;
  window._collectionsReadyPromise = loadDynamicCollections().then(newlyAdded => {
    if(requestedSlug && newlyAdded.includes(requestedSlug.toLowerCase()) && LIVE_SLUG !== requestedSlug.toLowerCase()){
      if(typeof _applyCollectionSwitch === 'function') _applyCollectionSwitch(requestedSlug.toLowerCase());
    } else {
      if(typeof updateMenuLinks === 'function' && COLLECTIONS[LIVE_SLUG]) updateMenuLinks(COLLECTIONS[LIVE_SLUG]);
      if(newlyAdded.length && typeof populateCollectionSwitcher === 'function') populateCollectionSwitcher();
    }
    // Same reasoning as updateMenuLinks above: banner/avatar for a
    // hardcoded baseline collection (e.g. argonauts) only arrive via this
    // fetch, never available synchronously at the init() call below.
    if(typeof applyCollectionBannerHeader === 'function') applyCollectionBannerHeader();
  });
})();

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
    fetch(`${LIVE_ENDPOINT}/os/owner?contract=${LIVE_CONTRACT}&tokenId=${id}&chain=${LIVE_CHAIN}`)
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
  // jv: "argonauts are loading ocas traits, you can see in the modal. Human
  // 2 is an OCAS trait." The static trait chunk files are OCAS's own. For
  // any other collection, a chunk asked for before its /db/all-traits data
  // arrived was fetched from OCAS's files and cached for the session --
  // Argonaut #8829 got OCAS #8829's traits. Other collections now only ever
  // use their own data: wait for it, and never cache an empty stand-in.
  if(typeof LIVE_SLUG !== 'undefined' && LIVE_SLUG !== 'on-chain-all-stars'){
    // Bounded wait: if the data request is slow or retrying (e.g. the bot
    // mid-deploy), don't hang whatever asked (the token modal did); carry on
    // without traits -- never OCAS's -- and the next lookup tries again.
    if(window._allTraitsPromise){
      try{ await Promise.race([window._allTraitsPromise, new Promise(r => setTimeout(r, 6000))]); }catch(_){}
    }
    return CHUNK_CACHE.get(idx) || {};
  }
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
  // jv: "Ocas traits are coming through for nekoadz." Confirmed the
  // exact same race already fixed once for ensureComboRows()
  // (comboInsights.js) and _getTokenImgSrcAsync() (this file): this
  // iterates ensureChunk() directly with no guard against CHUNK_CACHE
  // not being warmed yet for the current collection. If this ran
  // before the bulk /db/all-traits fetch finished, ensureChunk() would
  // silently fall through to OCAS's own static chunk files -- building
  // TRAIT_DOMAIN/TRAIT_FREQ (and therefore the whole trait accordion,
  // Combo Intelligence's underlying data, and rank) from OCAS's wrong
  // categories entirely, exactly matching what showed up for nekoadz
  // (Accessory I/II, Body, Clothes, Eyes, Head, Mouth -- OCAS's own
  // categories, not nekoadz's). Awaiting the same promise those two
  // fixes already use before ever touching a chunk.
  if(window._allTraitsPromise) await window._allTraitsPromise;
  // Build into temp objects so TRAIT_DOMAIN stays readable during loading
  const _freq={}, _domain={};
  let _max=0;
  const _countFreq={};
  // jv: "the burned tokens shouldn't count towards the rarity... they're
  // removed from the collection permanently so they can't count towards
  // rarity." Confirmed: this client-side fallback (only actually run
  // when the server-computed fast-path -- lib/rank-compute.js in
  // ocas-sales-bot, which already correctly excludes is_burned tokens
  // from both frequency and scoring, and already re-triggers itself the
  // moment lib/burn-detect.js marks new ones -- isn't available for some
  // reason) had no such exclusion at all. row.burned (the general,
  // any-collection is_burned flag exposed via /db/all-traits, separate
  // from OCAS's own fusion-mechanic survivors which are excluded from
  // that response entirely already) is now skipped in every pass below,
  // matching the server path exactly: never counted toward any other
  // token's trait/trait-count rarity, and never assigned a rank of its
  // own.
  for(const idx of indices()){
    const ch=await ensureChunk(idx);
    for(const [sid,row] of Object.entries(ch)){
      if(row.burned) continue;
      const n=getTraitCount(row); if(n>_max) _max=n;
      _countFreq[n]=(_countFreq[n]||0)+1;
      for(const [k,v] of keepEntries(row.traits)){ (_domain[k] ||= new Set()).add(v); (_freq[k] ||= {})[v]=(_freq[k][v]||0)+1; }
    }
  }
  // Swap atomically when complete — TRAIT_DOMAIN never goes empty mid-load
  TRAIT_FREQ=_freq; TRAIT_DOMAIN=_domain; MAX_TRAIT_COUNT=_max; TRAIT_COUNT_FREQ=_countFreq;
  // jv: "We are getting much much closer but I think the low trait
  // count may be getting a little too much weight especially over a
  // trait like alien bones where there is only 9 in the whole
  // collection." A fixed, named constant rather than a magic number
  // inline -- deliberately tunable, matches the same constant in the
  // server-side computation (lib/rank-compute.js, ocas-sales-bot) that
  // Argonauts and every other non-OCAS collection actually uses; this
  // is the fallback path for when that isn't available.
  //
  // Halved 4 -> 2: the first live recompute at weight=4 surfaced the
  // same failure from the other direction -- jv found Argonaut #2400
  // (Palette: Seafoam 1.4%, Bones: Floral 5.0%, zero worn traits) at
  // Rank 6, ahead of genuinely rare worn traits like Bones: Alien
  // (~0.09%). Floral/Seafoam are common-tier values; at weight=4 the
  // zero-worn-trait bonus alone outscored that. Kept in sync with the
  // server-side constant above.
  const TRAIT_COUNT_WEIGHT = 2;

  const obs=[];
  for(const idx of indices()){
    const ch=await ensureChunk(idx);
    for(const [sid,row] of Object.entries(ch)){
      if(row.burned) continue;
      let s=0; for(const [k,v] of keepEntries(row.traits)){ const c=(TRAIT_FREQ[k]?.[v])||1; const p=c/(TOKEN_COUNT||1); s += -Math.log(Math.max(p,1e-12)); }
      const n=getTraitCount(row);
      const tcP=(TRAIT_COUNT_FREQ[n]||1)/(TOKEN_COUNT||1);
      s += TRAIT_COUNT_WEIGHT * -Math.log(Math.max(tcP,1e-12));
      obs.push([+sid,s]);
    }
  }
  // jv: "Thinking we might need to reevaluate the ranking logic. I
  // don't think it's taking into account 0 traits and 1 traits which.
  // OS ranking got those specifically are much better rankings."
  // Confirmed with hard evidence (8 side-by-side screenshots comparing
  // exact OpenSea rank vs this app's own rank for the same tokens): a
  // token with zero "worn" traits (just Bones/Palette/Print, this
  // collection's three always-present base attributes) ranked #346 on
  // OpenSea -- top 3.5% -- but #4818 here, near median. A discrepancy
  // of over 4,400 positions, and the pattern repeated across every
  // pair jv sent.
  //
  // First fix: sorted by trait-count rarity as an absolute, separate
  // dimension ahead of individual-trait score -- but jv's own follow-up
  // test (filtering to 9 tokens sharing an extremely rare "Bones:
  // Alien" trait, only 9 out of ~10,000) showed several of those 9
  // trapped at near-identical rank numbers in the thousands, a dead
  // giveaway that an absolute trait-count dimension let a merely
  // moderately uncommon trait count veto an individual trait that was,
  // on its own, rare enough to land in OpenSea's own top 20 every time.
  //
  // Trait count is now folded back into the same weighted-additive
  // score instead (TRAIT_COUNT_WEIGHT above) -- a heavy boost rather
  // than an unconditional veto, so a sufficiently extreme individual
  // trait can still out-rank a token whose only advantage is trait
  // count.
  obs.sort((a,b)=>b[1]-a[1]); RARITY_OBS_RANK=new Map(obs.map(([id,_],i)=>[id,i+1]));
  if(PROB_DATA){
    function pTheo(g,n){ const blk=PROB_DATA[g]; const w=blk?blk[n]:undefined; if(typeof w==='number'){ const scale=PROB_DATA._scale||10000; return Math.max(1e-12,w/scale);} const c=(TRAIT_FREQ[g]?.[n])||1; return Math.max(1e-12,c/(TOKEN_COUNT||1)); }
    const theo=[];
    for(const idx of indices()){
      const ch=await ensureChunk(idx);
      for(const [sid,row] of Object.entries(ch)){
        if(row.burned) continue;
        let p=1; for(const [k,v] of keepEntries(row.traits)) p*=pTheo(k,v);
        const n=getTraitCount(row); const cCount=(TRAIT_COUNT_FREQ[n])||1;
        // Same weighting as the observed-mode branch above -- raising
        // this probability term to TRAIT_COUNT_WEIGHT is the
        // multiplicative-domain equivalent of multiplying its -log(p)
        // contribution in the additive domain above.
        p *= Math.pow(Math.max(cCount/(TOKEN_COUNT||1), 1e-12), TRAIT_COUNT_WEIGHT);
        theo.push([+sid,p]);
      }
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
async function fetchRow(id){ if(ROW_CACHE.has(id)) return ROW_CACHE.get(id); const idx=chunkIndexFor(id); const ch=await ensureChunk(idx); const found=ch[String(id)]; const row=found||{traits:{}}; if(found) ROW_CACHE.set(id,row); /* don't remember a not-loaded-yet stand-in */ return row; }

/* recompute */
// jv: "I click the x on purp hat to close it and the 0 trait
// disappears and is no longer there." Confirmed via the debug history
// this was never actually a bug -- computeFilteredState() correctly
// recovers the "0" bucket the moment the trait value genuinely gets
// removed (activeTraits back to []); what looked like it "staying
// gone" in earlier reports was removing the trait COUNT pill instead
// of the trait VALUE pill, which correctly leaves "0" hidden since the
// trait value itself is still active. Settled; debug logging below
// removed.
async function computeFilteredState(){
  const buckets={}, idByCount={}, avail={};
  for(const idx of indices()){
    const ch=await ensureChunk(idx);
    for(const [sid,row] of Object.entries(ch)){
      const id=+sid; if(!passesRankFilter(id)) continue; if(!rowMatchesActiveTraitsOnly(row)) continue;
      const n=getTraitCount(row); buckets[n]=(buckets[n]||0)+1; (idByCount[n] ||= []).push(id);
      for(const [k,v] of keepEntries(row.traits)){ (avail[k] ||= new Map()).set(v, ((avail[k].get(v)||0)+1)); }
    }
  }
  return {buckets, idByCount, avail};
}
function updateTraitFloor(){
  const bar = document.getElementById('traitFloorBar');
  if(!bar) return;
  // jv: "mobile doesn't need the floor traits stat. Keep that desktop
  // only." Same viewport threshold already used throughout this codebase
  // for every other desktop/mobile split (e.g. VS.init()'s own check).
  if(window._tvIsPhone()){ bar.style.display = 'none'; return; }
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
  const traitFloorSym = window._liveCurrencySymbol || 'ETH';
  document.getElementById('traitFloorPrice').textContent = ['ETH','WETH'].includes(traitFloorSym) ? `Ξ ${floor.price.toFixed(4)} ${traitFloorSym}` : `${floor.price.toFixed(4)} ${traitFloorSym}`;
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

let _lastFilteredTotal = null; // set by updateChartAndList(); total tokens matching the current filter combination, shown next to the active-filter pills
async function updateChartAndList(){
  // jv: multiple attempts at preserving scroll position through this
  // rebuild (raw pixel restore, anchoring to the clicked row, anchoring to
  // the topmost visible row/header, a category-header fallback when the
  // anchor value itself disappears, a visibility re-check on the re-found
  // anchor, a hard cap on how large a single correction could be) each
  // fixed a specific, confirmed bug in isolation and were verified working
  // in extensive local testing -- including a version with the hard cap
  // that should have made an extreme jump mathematically impossible from
  // this mechanism -- and jv still hit a new failure each time in the real
  // app regardless. That gap between passing local tests and a live
  // failure that a hard cap shouldn't allow means something about this
  // mechanism doesn't behave the way it does in local testing, for a
  // reason not yet identified. Removed the whole thing rather than
  // continue guessing at increasingly specific patches -- the safer state
  // given repeated failures is the plain rebuild below, with no attempt at
  // scroll preservation at all, until this can be revisited with a way to
  // actually see what's happening in the real environment rather than only
  // in local simulation.
  const {buckets, idByCount, avail}=await computeFilteredState(); CHART_ID_MAP=idByCount; AVAILABLE_DOMAIN=avail;
  // jv: "when I click on either a combo of traits or even a trait count
  // and trait combo can we add a total number of that combo somewhere
  // maybe beside the pills above the grid?" -- buckets is already the
  // exact per-count breakdown of every token matching the CURRENT
  // filter combination (trait values + trait count together); summing
  // it gives the total token count that combination matches, which
  // renderActiveChips() displays next to the pills themselves.
  _lastFilteredTotal = Object.values(buckets).reduce((a,b)=>a+b,0);
  // jv: "I think i understand now... Can that number be presented
  // somewhere on the main grid so it's visible without having to open
  // the drawer?" -- _lastFilteredTotal already reflects exactly how
  // many tokens match the current trait/trait-count selection
  // together; the active-filters panel's own version of this only
  // ever showed inside the drawer itself. This mirrors it on the main
  // grid's own control row (#gridMatchCount, next to Live Listings/
  // sort -- visible on both desktop and mobile, unlike the desktop-
  // only token-trait-search bar), so it's visible without opening
  // anything. Only shown once a real filter narrows things down, same
  // as the drawer's own version -- the full collection count isn't
  // useful info on its own.
  const gridMatchEl = document.getElementById('gridMatchCount');
  if(gridMatchEl){
    const hasFilter = (activeTraits && activeTraits.size > 0) || (typeof currentTraitCount !== 'undefined' && currentTraitCount !== null);
    gridMatchEl.textContent = hasFilter ? `${_lastFilteredTotal.toLocaleString()} match${_lastFilteredTotal===1?'':'es'}` : '';
  }
  drawOrUpdateChart(buckets); renderTraitChips(buckets); await renderTokenGridFromState(); renderTraitAccordion($('#traitSearch').value); renderActiveChips(); if(typeof window.renderSalesForCurrentTraits==='function') window.renderSalesForCurrentTraits(); if(typeof updateTraitFloor==='function') updateTraitFloor(); _applyHoldersTraitFilter();
  // jv: "on mobile when i select a trait to filter within the sale
  // chart tab it filters it for the main grid and not in the sales
  // chart tab at all." Root cause: switchAnalyticsSheetTab() (the
  // mobile bottom sheet's own tab switcher) never adds an .active CSS
  // class to the panel it's showing at all -- it just moves the panel's
  // DOM node in/out of the sheet and toggles its inline display style.
  // .active is purely a desktop (switchTopTab()) convention. This check
  // was looking for a class mobile never sets, so it silently never
  // fired there -- the shared activeTraits state still updated
  // correctly (that's a separate code path), just never told the Sale
  // Chart tab specifically to redraw. _isSaleChartTabVisible() checks
  // actual rendered visibility instead, which is true under either
  // mechanism.
  //
  // jv: "The sales chart filter tab should only filter within the
  // sales chart, not the entire page." Now that the Sale Chart reads
  // its own separate window._saleChartActiveTraits/window._saleChartTraitCount
  // (see renderSaleChart()) instead of the activeTraits/currentTraitCount
  // this function is reacting to here, a sidebar trait change no longer
  // changes anything the Sale Chart shows -- re-rendering it from here
  // would just be a wasted WebGL rebuild on every sidebar click, for a
  // chart that's still showing exactly what it showed before. Removed.
}
// jv: see the comment above updateChartAndList()'s own call to this --
// same fix applies here.
function _isSaleChartTabVisible(){
  const p = document.getElementById('ttab-salechart');
  return !!p && getComputedStyle(p).display !== 'none';
}

/* grid */
function gridThumbHtml(id,row){
  // jv: "OCAS keeps showing up in the other collections when I load it up
  // from the landing page." Same cross-collection collision class as
  // _imgSrc()'s identical fix (mobile/VS path) -- mapVal (IMAGES_MAP) is
  // only ever populated from OCAS's own static files, keyed purely by
  // numeric token ID with zero collection awareness, yet was read
  // completely unguarded here regardless of which collection is actually
  // active. Guarding it the same way imgForId() and the fixed _imgSrc()
  // already do: only OCAS itself may ever read this map.
  const mapVal=(LIVE_SLUG === 'on-chain-all-stars') ? (IMAGES_MAP && IMAGES_MAP.get(id)) : null;
  // row.image (live, from /db/all-traits) takes priority over the static
  // original-mint chunk image. Only burn survivors ever have row.image set,
  // so for the ~99% of tokens that never burned this falls through to mapVal
  // exactly as before. Previously mapVal was checked first, which meant a
  // survivor's current appearance wouldn't show until refreshLiveTokenData's
  // periodic pass (30s after load, then every 5min) caught up and overwrote
  // IMAGES_MAP — a real, if temporary, staleness window on every fresh load.
  //
  // jv confirmed live: desktop grid showed no images at all, for any
  // collection, mobile unaffected. Root cause -- this fell back to
  // imgForId(id), a function that isn't real anywhere in this codebase
  // (same latent bug flagged and fixed in several other spots already this
  // session, e.g. buildMispricedPanel, _getRawSvgForDownload). Calling it
  // unguarded throws a ReferenceError, breaking every single card whose
  // row.image and mapVal were both empty -- the overwhelming majority of
  // tokens, since row.image is only ever set for burn survivors and mapVal
  // (IMAGES_MAP) is only ever populated for OCAS in the first place. Never
  // caught before now because mobile uses a completely separate rendering
  // path (VS, the virtual scroller) that already calls the correct,
  // collision-safe _getTokenImgSrc() -- this desktop-only function was
  // simply never touched during any of that work.
  const src=row.image || mapVal || (typeof _getTokenImgSrc === 'function' ? _getTokenImgSrc(id) : null);
  if(!src) return '<div class="thumb"></div>';
  const s=String(src).trim();

  // Inline SVG: render as an isolated image instead of injecting raw SVG into the DOM.
  // This preserves the token's own internal background/colors and avoids page CSS
  // accidentally overriding SVG presentation when inserted inline.
  if(s.startsWith('<svg')){
    try{
      const svgDataUri = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(_svgCrisp(s));
      return `<div class="thumb"><img loading="lazy" src="${svgDataUri}" alt="#${id}" style="width:100%;height:100%;image-rendering:pixelated;display:block;object-fit:contain;"></div>`;
    }catch(e){
      return `<div class="thumb"><div class="svg-wrap">${_svgCrisp(s)}</div></div>`;
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
// jv: "make the weth and eth wording through the page green for eth and
// red for weth." This badge hardcoded #2dd4bf (the site's teal "green")
// for the price text regardless of currency -- now checks the actual
// currency (window.LISTINGS[id].opensea.currency, populated by the
// backend fix alongside listStatsRowHtml's identical fix) and switches
// to #f87171 (the same red used elsewhere for WETH) when it's WETH.
function priceBadgeHtml(id){ const ent=(window.LISTINGS&&window.LISTINGS[id]&&window.LISTINGS[id].opensea)||null; if(!ent || ent.price_eth==null) return ''; const txt = formatEth(ent.price_eth, ent.currency); if(!txt) return ''; const isWeth = (ent.currency||'ETH').toUpperCase() === 'WETH'; const priceColor = isWeth ? '#f87171' : '#2dd4bf'; const bgColor = isWeth ? '#3a1414' : '#0d261c'; const borderColor = isWeth ? '#543' : '#354'; const inner = `<span style="color:var(--sub);font-weight:500">OpenSea </span><span style="color:${priceColor};font-weight:700">${txt}</span><span style="color:var(--sub);opacity:.6"> • live</span>`; return ent.url ? `<a class="chip" href="${ent.url}" target="_blank" rel="noopener" style="border-color:${borderColor};background:${bgColor};text-decoration:none">${inner}</a>` : `<span class="chip" style="border-color:${borderColor};background:${bgColor}">${inner}</span>`; }
function rankTier(rank){
  const r=parseInt(rank,10);
  if(r<=100) return 'gold';
  if(r<=1000) return 'blue';
  if(r<=5000) return 'purple';
  return '';
}
function rankColor(rank){
  // Confirmed live with jv: minimal theme should mean genuinely fewer
  // colors throughout, not just the badges/pills -- this rank-tier
  // gold/purple/blue rainbow is exactly the kind of thing that competes
  // with the art rather than the tokens themselves. A single neutral tone
  // regardless of tier when minimal is active; the tier-color system stays
  // fully intact for the existing four themes.
  if((document.documentElement.getAttribute('data-theme') || '').startsWith('minimal-')){
    return 'var(--sub)';
  }
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
  // jv confirmed live: toggling did nothing visible. Root cause: VS's
  // per-card node cache is keyed only by `${mode}:${id}` (see VS._paint),
  // so every visible card was just being served back from cache exactly as
  // it looked under the OLD rank system -- same bug class as the
  // cross-collection cache poisoning already fixed for collection switches
  // (resetCollectionState() already clears this same cache for that
  // reason). The rank badge is baked into the cached DOM node itself, so
  // the fix is to blow away the cache here too, forcing every visible card
  // to be rebuilt fresh under the new system.
  if(typeof VS !== 'undefined' && VS._nodeCache){
    VS._nodeCache.clear();
    VS.visStart = -1; VS.visEnd = -1;
  }
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
  // jv confirmed live: clicking a Discord sale/listing embed's TraitView
  // link (?jump=ID) landed on an empty grid whenever "Live Listings" was
  // checked and the target token wasn't currently listed -- exactly the
  // case for a SALE link, since a token that just sold is by definition no
  // longer listed. This filter is meant to narrow the general browsing
  // grid, never to hide the one specific token a direct link was asked to
  // show -- the entire point of a jump link is to show that token
  // regardless of its listing state. skipListedFilter lets the ?jump=
  // fast path opt out of it for this one render call, without touching
  // the user's actual Live Listings toggle (so it's still exactly where
  // they left it once they navigate away from the jumped token).
  const skipListedFilter = !!(opts && opts.skipListedFilter);
  window.LAST_IDS = Array.isArray(ids) ? ids.slice() : [];
  const onlyListed = !skipListedFilter && document.getElementById('onlyListed').checked;
  const tg=$('#tokenGrid'); tg.innerHTML='';
  const isMobile = window._tvIsPhone();
  // jv confirmed live: "the 5x5 grid works but that's it." Root cause --
  // this used to read tg.classList to figure out the current mode, but
  // that read happened BEFORE applyViewMode() (right below) updates those
  // very classes for THIS render -- so `mode` below was always one full
  // render cycle stale, chained off whatever the previous render cycle
  // happened to leave on tg, not the user's actual current selection.
  // This function reruns on essentially every filter/sort/search change,
  // not just a view-button click or collection switch -- far more often
  // than setView()'s own, already-correctly-fixed path -- so it was the
  // dominant path actually deciding what got virtualized, and could
  // silently revert a button click's correct mode on the very next
  // unrelated interaction. Reading the same source of truth
  // applyViewMode() itself uses (localStorage/the #viewMode select),
  // rather than a DOM class that's inherently a step behind, then mapping
  // it through the same _vsModeFor() every other call site already uses.
  const desiredView = localStorage.getItem(VIEW_KEY)||document.getElementById('viewMode')?.value||'standard';
  const currentViewMode = _vsModeFor(desiredView);
  /* progressive paint */
  const BATCH=180; let i=0; applyViewMode(desiredView);
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
    if(mp){ mp.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:10px 0">Toggle "Only show listed" to see mispriced listings.</div>'; }
    const mpb = document.getElementById('mispricedCountBadge');
    if(mpb) mpb.textContent = '–';
  }
  updateTokenTraitSearchStatus(ids.length);
  if(!ids.length){ tg.appendChild(el('div',null,'No matches.')); return;}

  // ── Virtual scroller: mobile + desktop ───────────────────────────────────
  {
    const mode = currentViewMode;
    // jv confirmed live (fourth report of "switching grids doesn't
    // work"): logging this render path's own mode decision too, since
    // this function reruns on nearly every filter/sort/search change --
    // if this ever disagrees with what [ViewSwitch] just logged for a
    // button click, this path is the one winning (it runs after, on the
    // very next render), which would explain a click "reverting."
    console.log(`[MainRender] desiredView=${desiredView} mode=${mode} idsLength=${ids.length}`);
    // Confirmed live: desktop rendering ALL matching tokens in the grid at
    // once (batched 72 at a time, but still every single one eventually)
    // was the actual dominant cost behind "thumbnails take a while to
    // switch over" -- not page-navigation overhead, which the in-place
    // collection switch already fixed separately. VS's own desktop card
    // rendering (_standardCard, _listCard) already existed, fully built,
    // just never activated -- this comment itself already said "mobile +
    // desktop" while the code below only ever enabled it for mobile.
    // Confirmed and fixed three real gaps in VS's desktop path before
    // enabling this: _computeCols didn't handle the grid5 view mode's
    // fixed 5-column layout, VS.init()'s CSS class handling never
    // preserved view-5x5/view-2x2 (both real CSS classes the corresponding
    // view modes depend on), and _paint()'s end-of-render logic only ever
    // called applyViewMode() for compact specifically, silently missing it
    // for grid5 and standard.
    const shouldVirtualize = true;
    if(shouldVirtualize){
      await VS.init(ids, mode);
      return;
    }else{
      VS.enabled = false;
      tg.classList.remove('vs-active');
      tg.onscroll = null;
      if(tg._vsWinListener){
        document.removeEventListener('scroll', tg._vsWinListener, true);
        window.removeEventListener('resize', tg._vsWinListener);
        tg._vsWinListener = null;
      }
    }
  }

  const __GRID_BATCH = !window._tvIsPhone() ? 72 : 150;
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
  // Queue image refresh for visible listed tokens, AND for visible burn
  // survivors. Survivors are the other case where the static IMAGES_MAP
  // (baked at build time from each token's original appearance) is known
  // wrong -- a survivor's on-chain image evolves with each burn it wins,
  // but nothing proactively re-fetches it, so it silently shows its
  // pre-burn art until someone happens to open its modal (which is the
  // only other place that calls _fetchFreshImg). SURVIVOR_COUNT_MAP is
  // already loaded globally for the modal/grid "Survivor" badge, so reuse
  // it here instead of guessing/refreshing every visible token.
  if(typeof _queueImgRefresh === 'function'){
    const visibleIds = [...document.querySelectorAll('#tokenGrid [data-id]')].map(el => +el.dataset.id);
    const visibleListed = window.LISTINGS
      ? visibleIds.filter(id => window.LISTINGS[id]?.opensea?.price_eth != null)
      : [];
    const visibleSurvivors = window.SURVIVOR_COUNT_MAP
      ? visibleIds.filter(id => window.SURVIVOR_COUNT_MAP.get(id) > 0)
      : [];
    const toQueue = [...new Set([...visibleListed, ...visibleSurvivors])].slice(0, 30);
    if(toQueue.length) _queueImgRefresh(toQueue);
  }
  // Re-apply the active grid view AFTER cards are rendered.
  // Important: listing data can load before the first grid render. In grid/2x2/5x5
  // views the normal .tmeta line is hidden, so price badges must be stamped as
  // overlay badges after the token DOM exists. Otherwise prices only appear after
  // switching views.
  if(!window._tvIsPhone()){
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

  // jv confirmed live (screenshots): this mobile fast path -- which built the
  // token list directly from a rank map's keys, skipping ensureChunk()
  // entirely -- was the actual cause of two distinct, separate bugs at once.
  // (1) Badges (rank, price, id) rendered fine since those come straight
  // from the rank maps, but the actual picture stayed blank: _standardCard's
  // fallback path (fetchRow -> ensureChunk -> ch[String(id)]) is the only
  // thing that ever populates row.image, and this fast path never primed
  // that for the ids it grabbed. (2) When "Rarity Rank: OS" was selected,
  // it read whatever OS_RANK_MAP contained regardless of whether that data
  // actually corresponded to the currently active collection.
  // Removed entirely rather than continue patching: its original
  // rationale ("avoid waiting for chunks") no longer applies now that
  // CHUNK_CACHE is already fully pre-warmed via /db/all-traits before this
  // function ever runs, so the fallback loop below is already fast -- it's
  // also the exact path jv confirmed already works correctly (clicking a
  // trait filter, which always used this loop, fixed the display instantly
  // every time).
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
  // Same fix as the ?jump= fast path -- an exact single-ID search means
  // the user wants to see that specific token, regardless of whether it's
  // currently listed.
  await renderTokenGrid(finalIds, { skipListedFilter: !!window.__TOKEN_ID_EXACT_SEARCH__ });
}

/* chart helpers moved to js/chart.js */

/* traits UI */
function renderActiveChips(){
  const host=$('#activeChips'); host.innerHTML='';
  const entries=[...activeTraits.entries()].flatMap(([g,s])=>[...s].map(v=>({group:g,value:String(v)})));
  // jv confirmed live: this only ever considered activeTraits (individual
  // trait/value picks) -- selecting a Trait Count with no specific trait
  // values chosen showed "No traits selected" here even while a real
  // filter was actively narrowing the grid/sales/everything else, and had
  // no removable pill of its own the way every other filter does.
  const hasCount = typeof currentTraitCount !== 'undefined' && currentTraitCount !== null;
  if(entries.length===0 && !hasCount){ host.innerHTML='<span class="section" style="opacity:.8">No traits selected</span>'; return;}
  if(hasCount){
    const chip=el('div','chip',`<b>Traits</b>: ${currentTraitCount} &nbsp;×`);
    chip.title='Remove this filter';
    chip.onclick=async()=>{
      currentTraitCount=null;
      document.querySelectorAll('#traitChips .chip').forEach(n=>n.classList.remove('active'));
      if(typeof window.syncSalesFilterUI==='function') window.syncSalesFilterUI();
      await updateChartAndList();
    };
    host.appendChild(chip);
  }
  for(const {group,value} of entries){ const chip=el('div','chip',`<b>${group}</b>: ${value} &nbsp;×`); chip.title='Remove this filter'; chip.onclick=async()=>{ const s=activeTraits.get(group); if(!s) return; s.delete(value); if(s.size===0) activeTraits.delete(group); await updateChartAndList(); }; host.appendChild(chip);}
  // jv: "when I click on either a combo of traits or even a trait count
  // and trait combo can we add a total number of that combo somewhere
  // maybe beside the pills above the grid?" -- _lastFilteredTotal (set
  // by updateChartAndList(), right before this function runs) is exactly
  // how many tokens match everything currently selected together, not
  // just one piece of it.
  if(typeof _lastFilteredTotal === 'number'){
    const totalEl = el('span', 'section', `${_lastFilteredTotal.toLocaleString()} match${_lastFilteredTotal===1?'':'es'}`);
    totalEl.style.opacity = '.75';
    totalEl.style.marginLeft = '4px';
    host.appendChild(totalEl);
  }
}
function renderTraitChips(b){
  // Trait counts that exist in this collection, for the 🔔 alerts flow
  // (js/alerts.js) -- accumulated so a filtered view doesn't hide counts.
  try{ const seen = new Set(window._tvTraitCounts || []); Object.keys(b || {}).forEach(k => { if((b[k] || 0) > 0) seen.add(+k); }); window._tvTraitCounts = [...seen].sort((x, y) => x - y); }catch(_){}
  const host=$('#traitChips'); host.innerHTML='';
  // jv: "there doesn't need to be all these tokens [trait-count pills]...
  // if a collection only has the lowest 4 traits and highest 8 traits,
  // then there doesn't need to show anything below 4 or above 8." The old
  // Math.max(16, ...) floor meant every collection always showed pills for
  // counts 1-16 regardless of what's actually in it -- Argonauts' real
  // range is 3-7, so 1, 2, and 8-16 were all rendered as dead "(0)" pills.
  // Only rendering counts that actually have at least one token now, for
  // any collection's real range, not a fixed floor/ceiling.
  // jv confirmed live: this loop started at c=1, silently skipping a "0
  // traits" bucket even when the data genuinely has one -- harmless when
  // this was written (no collection's trait_count was ever 0 under the old
  // counting scheme, since Bones/Palette/Print were always counted as part
  // of it), but Argonauts' corrected worn-trait-only count means a bare
  // Argonaut is a real, legitimate 0 now. Starting at c=0 fixes it for
  // Argonauts without changing anything for any other collection, since
  // b[0] is simply absent/0 for them and the loop just does one harmless
  // extra no-op iteration.
  const maxSeen=Math.max(0,...Object.keys(b).map(Number));
  const realCounts = [];
  for(let c=0;c<=maxSeen;c++){
    const count=b[c]||0;
    if(count===0) continue;
    realCounts.push(c);
    const chip=el('div','chip',`Traits: <b>${c}</b> <span style="color:var(--sub)">(${fmt(count)})</span>`);
    chip.dataset.count=String(c);
    chip.classList.toggle('active',currentTraitCount===c);
    chip.addEventListener('click', async ()=>{
      currentTraitCount=(currentTraitCount===c?null:c);
      document.querySelectorAll('#traitChips .chip').forEach(n=>n.classList.toggle('active',Number(n.dataset.count)===currentTraitCount));
      await renderTokenGridFromState();
      // guarded: Plotly now loads in the background and may not be ready yet
      if(typeof Plotly !== 'undefined' && document.getElementById('chartHost')){
        try{ const cols2=colorsFor(LAST_XS);
          Plotly.restyle('chartHost', {'marker.color':[cols2.fill], 'marker.line.color':[cols2.line]}, [0]); }catch(e){}
      }
      if(typeof window.syncSalesFilterUI === 'function') window.syncSalesFilterUI();
      if(typeof window.renderSalesForCurrentTraits === 'function') window.renderSalesForCurrentTraits();
    });
    host.appendChild(chip);
  }
  // jv: "the ability to be able to filter the sales through traits or
  // trait counts would be very nice" -- populates the Sales tab's own
  // visible trait-count dropdown with this same real, non-zero range
  // (never a hardcoded 1-16), so it always matches whatever pills/chart
  // show for this collection. Only rebuilds the option list when the set
  // of real counts actually changed (e.g. on a collection switch) --
  // rebuilding on every single render would reset the dropdown's own
  // selection state for no reason.
  const salesSel = document.getElementById('salesTraitCountFilter');
  if(salesSel && salesSel.dataset.builtFor !== realCounts.join(',')){
    salesSel.dataset.builtFor = realCounts.join(',');
    const prevValue = salesSel.value;
    salesSel.innerHTML = '<option value="">Any</option>' + realCounts.map(c => `<option value="${c}">${c}</option>`).join('');
    salesSel.value = realCounts.includes(Number(prevValue)) ? prevValue : '';
  }
  // jv: "how about we add a search bar beside the trait count filtering
  // where I can type in traits and it will auto populate to the trait
  // sales that's typed out?" Native <input list>+<datalist> gives built-in
  // type-to-filter autocomplete for free, no custom dropdown UI needed.
  // Built from TRAIT_DOMAIN -- the same source of truth as the main
  // filter panel's own accordion -- as "TraitName: value" strings, so
  // it's always the real, current set for whichever collection is active,
  // never a stale or hardcoded list. Only rebuilt when the trait domain's
  // own signature actually changes (collection switch, or first load),
  // same guard reasoning as the trait-count dropdown just above.
  const searchOptionsEl = document.getElementById('salesTraitSearchOptions');
  if(searchOptionsEl){
    const domainKeys = Object.keys(TRAIT_DOMAIN||{}).sort().join(',');
    if(searchOptionsEl.dataset.builtFor !== domainKeys){
      searchOptionsEl.dataset.builtFor = domainKeys;
      const opts = [];
      for(const [name, values] of Object.entries(TRAIT_DOMAIN||{})){
        for(const v of values){ opts.push(`${name}: ${v}`); }
      }
      searchOptionsEl.innerHTML = opts.sort().map(o => `<option value="${o.replace(/"/g,'&quot;')}">`).join('');
    }
  }
  if(typeof window.syncSalesFilterUI === 'function') window.syncSalesFilterUI();
}
function renderTraitAccordion(q=''){ q=(q||'').trim().toLowerCase(); const acc=$('#accTraits');
  acc.innerHTML=''; const onlyPresent=$('#onlyPresent').checked; const names=Object.keys(TRAIT_DOMAIN).sort(); for(const name of names){ const groupMatch=!q||name.toLowerCase().includes(q); let values=[...TRAIT_DOMAIN[name]]; if(onlyPresent && AVAILABLE_DOMAIN && AVAILABLE_DOMAIN[name]){ const m=AVAILABLE_DOMAIN[name]; values=values.filter(v=>m.has(v)); } if(q && !groupMatch){ values=values.filter(v=>String(v).toLowerCase().includes(q)); } if(values.length===0 && !groupMatch) continue;
      // jv: "traits are pretty sporadic... should be displayed as rarest at
      // the top down to most common" -- this used to sort alphabetically
      // (localeCompare) with only "none" pushed last, which is exactly the
      // "sporadic" ordering jv described (rarity has nothing to do with a
      // value's name). The count-lookup logic used for the %-display below
      // already existed, just computed AFTER this sort ran, so it never
      // actually informed the order -- moved it up front here so both the
      // sort and the row display can share the exact same computed count,
      // rather than duplicating the lookup.
      const countFor = v => {
        if(AVAILABLE_DOMAIN && AVAILABLE_DOMAIN[name] instanceof Map && AVAILABLE_DOMAIN[name].has(v)) return AVAILABLE_DOMAIN[name].get(v);
        if(typeof TRAIT_FREQ === 'object' && TRAIT_FREQ[name] && TRAIT_FREQ[name][v]) return TRAIT_FREQ[name][v];
        return null;
      };
      values.sort((a,b)=>{ const an=String(a).toLowerCase()==='none'?1:0; const bn=String(b).toLowerCase()==='none'?1:0; if(an!==bn) return an-bn; const ca=countFor(a), cb=countFor(b); if(ca==null && cb==null) return String(a).localeCompare(String(b),undefined,{numeric:true}); if(ca==null) return 1; if(cb==null) return -1; if(ca!==cb) return ca-cb; return String(a).localeCompare(String(b),undefined,{numeric:true}); }); const item=document.createElement('div'); item.className='acc-item'; if(OPEN_GROUPS.has(name)) item.classList.add('open'); const head=document.createElement('div'); head.className='acc-head'; head.dataset.cat=name; head.innerHTML=`<h4>${name}</h4><span class="section">${values.length} values</span>`; head.onclick=()=>{ item.classList.toggle('open'); if(item.classList.contains('open')) OPEN_GROUPS.add(name); else OPEN_GROUPS.delete(name); }; const body=document.createElement('div'); body.className='acc-body'; const list=document.createElement('div'); list.className='checklist'; for(const v of values){ const id=`ck_${name}_${String(v).replace(/[^a-z0-9]+/gi,'_')}`; const row=document.createElement('label'); row.className='check'; 
      const __count = countFor(v);
      const __total = TOKEN_COUNT || (MANIFEST && (MANIFEST.tokenCount || (MANIFEST.files?.at(-1)?.end))) || 10000;
      const __pct = (__count && __total) ? ((__count/__total)*100) : null;
      // jv: "beside the % there should be a number of how many there are" --
      // __count was already computed for the sort above; just also surface
      // it in the display text rather than only using it internally.
      const __pctTxt = __pct!=null ? `<i class="trait-pct" style="opacity:.75;font-style:normal;font-size:12px;flex-shrink:0;margin-left:auto;padding-left:8px">${__count.toLocaleString()} · ${__pct < 0.1 ? __pct.toFixed(3) : __pct.toFixed(2)}%</i>` : '';
      row.innerHTML=`<input type="checkbox" id="${id}"><span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${v}</span>${__pctTxt}`; const cur=activeTraits.get(name); if(cur && cur.has(v)) row.querySelector('input').checked=true; row.querySelector('input').addEventListener('change', async (e)=>{ const set=activeTraits.get(name)||new Set(); if(e.target.checked) set.add(v); else set.delete(v); set.size?activeTraits.set(name,set):activeTraits.delete(name); OPEN_GROUPS.add(name); await updateChartAndList(); }); list.appendChild(row);} body.appendChild(list); item.appendChild(head); item.appendChild(body); acc.appendChild(item);}
}

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
    if(s.startsWith('<svg')) imgBox.innerHTML = `<div class="svg-wrap" style="width:100%;height:100%">${_svgCrisp(s)}</div>`;
    else if(/^data:image\//i.test(s)) imgBox.innerHTML = `<img src="${s}" alt="#${entry.token_id||''}">`;
    else imgBox.innerHTML = `<img src="${ipfsToHttp(s)}" alt="#${entry.token_id||''}">`;
  }
  if(entry.traits){
    const kv = keepEntries(entry.traits);
    const mTraits = document.getElementById('mTraits');
    if(mTraits) mTraits.innerHTML = kv.length ? kv.map(([k,v])=>`<div><span>${traitDisplayLabel(k)}</span><b>${v}</b></div>`).join('') : '<div style="color:var(--sub)">No traits</div>';
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
      #pipBar:not(.minimized){border-bottom:1px solid color-mix(in srgb, var(--text) 8%, transparent)}
      #pipBar.minimized{cursor:pointer;justify-content:center;height:100%}
      #pipFloorValue{display:none;color:var(--tc-1cffaf);font-size:13px;font-weight:800;white-space:nowrap}
      #pipBar.minimized #pipFloorValue{display:inline}
      #pipMinIcon{width:16px;height:16px;border-radius:5px;border:1px solid color-mix(in srgb, var(--text) 15%, transparent);color:#5a6578;font-size:10px;line-height:14px;text-align:center;flex:0 0 auto}
      #pipBar:hover #pipMinIcon{color:var(--text);border-color:color-mix(in srgb, var(--text) 32%, transparent)}
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

// jv: "On desktop full screen the fix we made to the hover display I want
// to add the token modal as well. Also I would like to add the token modal
// on mobile full screen chart display as well." Same root cause as the
// tooltip fix: desktop fullscreen (Fullscreen API) only renders the
// fullscreen element's own subtree, and #modal lives on the page outside
// it, so double-tapping a dot opened an invisible modal. While a chart is
// fullscreen, #modal is now moved INSIDE the overlay: on desktop that
// makes it visible; on mobile portrait -- where the overlay is CSS-rotated
// into landscape -- it rotates along with the chart instead of appearing
// sideways relative to it (sizing for that case is in styles.css under
// ".chart-fullscreen-overlay #modal"). Moved back to <body> when
// fullscreen closes (closeChartFullscreen).
function _placeModalForFullscreen(){
  const m = document.getElementById('modal');
  const overlay = document.getElementById('chartFullscreenOverlay');
  if(!m || !overlay) return;
  const target = overlay.classList.contains('open') ? overlay : document.body;
  if(m.parentNode !== target) target.appendChild(m);
}

async function openModal(id, opts={}){
  _placeModalForFullscreen();
  // jv: "the hover tool tip is sitting on top of the modal. Needs to sit
  // behind it." Once #modal is moved inside the fullscreen overlay it can
  // only stack as high as the overlay (9999), below the chart tooltip
  // (10500). Tooltips are hidden when the modal opens and won't reappear
  // while it's open (guard in _showChartTooltip).
  ['_saleChartTT','_floorTT','_scatterTT','_wdTT','_holderThumbTT'].forEach(t => { try{ _hideChartTooltip(t); }catch(e){} });
  window._modalCurrentId = +id;
  const row = await fetchRow(id);
  const m   = $('#modal');

  // ── Header ──────────────────────────────────────────────────
  // Modal always shows both OS rank and TV rank
  // jv: "the burned tokens still have a rarity rank... it shouldn't
  // have either... they're removed from the collection permanently."
  // This bypassed displayRankFor()/rankDisplay.js's own already-fixed
  // burned-token suppression entirely -- it reads OS_RANK_MAP/
  // RARITY_OBS_RANK directly instead, which is exactly why the fix
  // applied everywhere else (grid cards, etc.) never reached the modal
  // itself. Checking the same general is_burned flag (window.
  // _BURNED_TOKEN_SET) here too, for both rank systems, same reasoning
  // as before: OS_RANK_MAP is external data this site only mirrors,
  // with no ability to make OpenSea itself stop ranking a token it may
  // still consider part of the collection.
  const _isBurned = !!(window._BURNED_TOKEN_SET && window._BURNED_TOKEN_SET.has(+id));
  const _osR = _isBurned ? null : OS_RANK_MAP.get(+id);
  const _tvR = _isBurned ? null : RARITY_OBS_RANK.get(+id);
  const _osChip  = _osR ? `<span class='chip'>${rankDiamondHtml(_osR,'','os')}</span>` : '';
  const _tvChip  = _tvR ? `<span class='chip'>${rankDiamondHtml(_tvR,'','tv')}</span>` : '';
  const _ownedChip = connectedWalletOwns(id) ? `<span class="chip" style="color:var(--tc-1cffaf);border-color:rgba(28,255,175,.35);background:rgba(28,255,175,.08)">Owned</span>` : '';
  const _burnedChip = (window._BURNED_IDS && window._BURNED_IDS.has(+id)) ? `<span class="chip" style="color:var(--tc-f87171);border-color:rgba(248,113,113,.35);background:rgba(248,113,113,.08)">🔥 Burned</span>` : '';
  const _survivorChip = survivorChipHtml(id);
  $('#mTitle').innerHTML = `#${id} &nbsp; ${_osChip}${_tvChip}${_ownedChip}${_burnedChip}${_survivorChip}`;
  hydrateMarketPersonalityTags(id, row);
  const links = $('#mLinks'); links.innerHTML = '';
  const listing = (window.LISTINGS&&window.LISTINGS[id]&&window.LISTINGS[id].opensea)||null;
  const ethVal  = parseEthMaybeWei(listing?listing.price:null);
  // Always show OpenSea link (with price if listed, otherwise just "OpenSea")
  const osHref = listing?.url || `https://opensea.io/assets/ethereum/${LIVE_CONTRACT}/${id}`;
  const osText = (listing&&ethVal!=null) ? `OpenSea (${formatEth(ethVal, listing.currency)})` : 'OpenSea';
  const osA = document.createElement('a'); osA.className='linkpill'; osA.href=osHref; osA.target='_blank'; osA.rel='noopener';
  // Show OpenSea logo + price if listed, logo only if not
  // OpenSea logo from seadn CDN
  const osSvg = `<img src="https://static.seadn.io/logos/Logomark-Blue.png" width="16" height="16" style="vertical-align:middle;border-radius:3px;flex-shrink:0" alt="OpenSea">`;
  osA.innerHTML = osSvg + (listing && ethVal != null ? ` <span style="margin-left:4px">${formatEth(ethVal, listing.currency)}</span>` : '');
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
  const dlAnimBtn = document.getElementById('mDownloadAnimBtn');
  const favBtn = document.getElementById('mFavoriteBtn');
  const alertBtn = document.getElementById('mAlertBtn');
  if(alertBtn) alertBtn.onclick = (e) => { e.stopPropagation(); if(typeof tvWatchToken === 'function') tvWatchToken(id); };
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
  // Compare A/B + Pin — same setCompare/pinAdd the grid pinbar overlay uses.
  // Added here specifically because that overlay is hidden entirely on
  // mobile (display:none across all grid view modes under 900px), which
  // left no way to reach these on a phone at all.
  const compareABtn = document.getElementById('mCompareABtn');
  const compareBBtn = document.getElementById('mCompareBBtn');
  const pinBtn = document.getElementById('mPinBtn');
  const _flash = (btn) => { btn.classList.add('flash'); setTimeout(() => btn.classList.remove('flash'), 220); };
  if(compareABtn) compareABtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); _flash(compareABtn); setCompare('A', id); };
  if(compareBBtn) compareBBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); _flash(compareBBtn); setCompare('B', id); };
  if(pinBtn) pinBtn.onclick = (ev) => { ev.preventDefault(); ev.stopPropagation(); _flash(pinBtn); pinAdd(id); };
  if(dlSvgBtn){
    // (Was reading an undefined `image` variable -- always false, so the SVG
    // option never appeared for non-OCAS collections. Uses the token's row.)
    const image = row && row.image;
    const hasInlineSvg = typeof image === 'string' && (image.trim().startsWith('<svg')
      || (typeof _isServedSvgUrl === 'function' && _isServedSvgUrl(image))); // lazy-image SVG collections
    const mapVal = (LIVE_SLUG === 'on-chain-all-stars') ? (IMAGES_MAP && IMAGES_MAP.get(id)) : null;
    const mapSvg = typeof mapVal === 'string' && mapVal.trim().startsWith('<svg');
    dlSvgBtn.style.display = (hasInlineSvg || mapSvg) ? 'inline-flex' : 'none';
    dlSvgBtn.onclick = () => downloadTokenSvg(id);
  }
  // jv: "can you look into how to get the animation download for
  // Nekoadz? It is animated but the download is a png." Download With
  // BG/No BG both flatten to a single frame via canvas (how a "download
  // PNG" feature works for any image, animated or not) -- there was no
  // option to just grab the original animated file directly, bypassing
  // that flattening entirely. row.animation (from /db/all-traits,
  // captured by the main backfill pipeline now -- see
  // collection-backfill.js's own comment on why it wasn't before) is a
  // raw URL/data URI in whatever format the metadata gives; this only
  // shows the button when the token actually has one, and downloads
  // that exact file directly rather than re-encoding it as anything.
  if(dlAnimBtn){
    const animUrl = row?.animation ? (typeof ipfsToHttp === 'function' ? ipfsToHttp(row.animation) : row.animation) : null;
    dlAnimBtn.style.display = animUrl ? 'inline-flex' : 'none';
    dlAnimBtn.onclick = () => {
      if(dlMenu) dlMenu.style.display = 'none';
      if(!animUrl) return;
      const ext = String(animUrl).toLowerCase().includes('.mp4') ? 'mp4'
        : String(animUrl).toLowerCase().includes('.webm') ? 'webm'
        : String(animUrl).toLowerCase().includes('.mov') ? 'mov'
        : 'gif';
      const a = document.createElement('a');
      a.href = animUrl;
      a.download = `${LIVE_SLUG || 'token'}-${id}.${ext}`;
      a.target = '_blank'; // cross-origin files often ignore `download` and open in a new tab instead -- still gets the file, just not a forced save
      document.body.appendChild(a);
      a.click();
      a.remove();
    };
  }

  // ── Listing price (instant — from cached LISTINGS) ───────────────────────
  const priceEl = document.getElementById('mPrice');
  if(listing && ethVal != null){
    priceEl.textContent = formatEth(ethVal, listing.currency);
    priceEl.style.display = 'inline';
  } else {
    priceEl.style.display = 'none';
  }

  // ── Owner (async, cached) ────────────────────────────────────────────────
  const ownerEl  = document.getElementById('mOwner');
  const addrEl   = document.getElementById('mOwnerAddr');
  const xLinkEl  = document.getElementById('mOwnerXLink');
  ownerEl.style.display = 'none';
  addrEl.textContent = '…';
  if(xLinkEl) xLinkEl.style.display = 'none';
  // Session cache
  if(!window.OWNER_CACHE) window.OWNER_CACHE = {};
  // jv: "If a wallet address has a .eth address would it be possible to
  // show that on traitview and if that wallet/profile has an x account
  // linked to it, would it be possible to link that x account on
  // traitview in the wallet view and modal?" fetchOwnerIdentity()
  // (formatUtils.js) is shared with the connected-holder panel, which
  // has this exact same enhancement.
  const applyOwnerIdentity = (addr) => {
    fetchOwnerIdentity(addr).then(identity => {
      // Only apply if this modal is still showing the same owner (a
      // fast token switch shouldn't let a slow, stale lookup overwrite
      // it).
      if(ownerEl.dataset.address?.toLowerCase() !== addr.toLowerCase()) return;
      if(identity.name) addrEl.textContent = identity.name;
      if(xLinkEl && identity.twitter){
        xLinkEl.href = `https://x.com/${identity.twitter}`;
        xLinkEl.style.display = 'inline-block';
      }
    });
  };
  const fetchOwner = async () => {
    if(window.OWNER_CACHE[id]){
      const addr = window.OWNER_CACHE[id];
      addrEl.textContent = addr.slice(0,6) + '…' + addr.slice(-4);
      ownerEl.dataset.address = addr;
      ownerEl.style.display = 'inline-flex';
      applyOwnerIdentity(addr);
      return;
    }
    try{
      const WORKER = window.LIVE_ENDPOINT || 'https://nft-live-listings.jvweb3.workers.dev';
      const r = await fetch(`${LIVE_ENDPOINT}/os/owner?contract=${LIVE_CONTRACT}&tokenId=${id}&chain=${LIVE_CHAIN}`);
      if(!r.ok) return;
      const j = await r.json();
      if(!j.owner) return;
      window.OWNER_CACHE[id] = j.owner;
      addrEl.textContent = j.owner.slice(0,6) + '…' + j.owner.slice(-4);
      ownerEl.dataset.address = j.owner;
      ownerEl.style.display = 'inline-flex';
      applyOwnerIdentity(j.owner);
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
  const mapVal = (LIVE_SLUG === 'on-chain-all-stars') ? (IMAGES_MAP && IMAGES_MAP.get(id)) : null;
  // See gridThumbHtml's comment above — row.image (live) beats the static map.
  const src    = row.image || mapVal || (typeof _getTokenImgSrc === 'function' ? _getTokenImgSrc(id) : null);
  // jv: "the burns... are actually animated. Anyway to get that
  // animation to display on the site??" row.animation (from
  // /db/all-traits, captured by lib/metadata-update-poller.js alongside
  // the static image) takes priority over the static image whenever a
  // token has one -- not just for burned tokens specifically, since
  // there's no reason to suppress a token's own animated art just
  // because it happens to still be alive.
  const animUrl = row.animation ? (typeof ipfsToHttp === 'function' ? ipfsToHttp(row.animation) : row.animation) : null;
  if(animUrl){
    const animLower = String(animUrl).toLowerCase();
    imgBox.innerHTML = (animLower.includes('.mp4') || animLower.includes('.webm') || animLower.includes('.mov') || animLower.includes('video/'))
      ? `<video src="${animUrl}" autoplay loop muted playsinline style="max-width:100%;max-height:100%;object-fit:contain"></video>`
      : `<img src="${animUrl}" alt="#${id}" style="max-width:100%;max-height:100%;object-fit:contain">`;
  } else if(src){ const s=String(src).trim(); if(s.startsWith('<svg')) imgBox.innerHTML=`<div class="svg-wrap" style="width:100%;height:100%">${_svgCrisp(s)}</div>`; else if(/^data:image\//i.test(s)) imgBox.innerHTML=`<img src="${s}" alt="#${id}">`; else imgBox.innerHTML=`<img src="${ipfsToHttp(s)}" alt="#${id}">`;} else imgBox.innerHTML='<div style="color:var(--sub)">No image</div>';
  // Fetch live image for this token (picks up background changes)
  // Uses shared TTL cache — hover and grid also benefit
  // Skip the "fresh" background-color re-fetch entirely when we're
  // already showing this token's own animation -- that path only ever
  // returns a static image and would silently replace the animation
  // with a still frame a moment after the modal opened.
  if(!animUrl && typeof _fetchFreshImg === 'function'){
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
  $('#mTraits').innerHTML = kv.length ? kv.map(([k,v])=>`<div><span>${traitDisplayLabel(k)}</span><b>${v}</b></div>`).join('') : '<div style="color:var(--sub)">No traits</div>';

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
  // jv: "Is there not other token tags than these? ... The tags should be
  // collection aware across all traits in the collection. Needs to be aware
  // of rare traits, cluster of traits, 1 of 1s, etc." The old tags assumed
  // OCAS (a Type category, Diamond/Blind Eyes, rank <= 1000, IDs capped at
  // the survivor count -- which silently dropped every Argonaut above
  // ~#8,600). Now every tag is built from THIS collection's own trait
  // frequencies (TRAIT_FREQ) and supply, so it works for any collection.
  // OCAS's bespoke flavor tags are kept, for OCAS only.
  const cleanIds = [...new Set((ids || []).map(Number).filter(id => Number.isFinite(id) && id >= 0))];
  const key = `${LIVE_SLUG}:${String(addr || '').toLowerCase()}:${cleanIds.slice().sort((a,b)=>a-b).join(',')}`;
  if(HOLDER_TAG_CACHE.has(key)) return HOLDER_TAG_CACHE.get(key);
  if(!cleanIds.length) return [];

  const isOcas = LIVE_SLUG === 'on-chain-all-stars';
  const colName = (typeof COLLECTIONS !== 'undefined' && COLLECTIONS[LIVE_SLUG]?.name) || 'tokens';
  const supply = TOKEN_COUNT || Object.values(TRAIT_FREQ || {})[0] && Object.values(Object.values(TRAIT_FREQ)[0]).reduce((a,b)=>a+b,0) || 10000;
  const skipCat = (k) => /^(fate|trait ?count|traits?)$/i.test(k);
  const skipVal = (v) => /^(none|null|n\/a|-)$/i.test(v);
  const pctStr = (x) => x >= 10 ? Math.round(x) + '%' : x.toFixed(1).replace(/\.0$/, '') + '%';

  const held = new Map();        // "k\u0001v" -> {k, v, total, ids}
  const pairs = new Map();       // "a\u0002b" -> {a, b, ids}
  const grailIds = [];
  const grailCut = Math.max(10, Math.ceil(supply * 0.01));
  let tokensSeen = 0;
  // OCAS-only flavor counters
  const typeCounts = new Map(), typeIds = new Map(), diamondIds = [], blindIds = [];

  for(const id of cleanIds){
    let row = null;
    try{ row = (ROW_CACHE && ROW_CACHE.get(id)) || await fetchRow(id); }catch(_){ }
    if(!row || row.burned) continue;
    tokensSeen++;
    const entries = keepEntries(row.traits || {}).filter(([k, v]) => !skipCat(k) && !skipVal(v));
    const rareish = [];
    for(const [k, v] of entries){
      const hk = k + '\u0001' + v;
      let h = held.get(hk);
      if(!h){ h = { k, v, total: TRAIT_FREQ?.[k]?.[v] || 0, ids: [] }; held.set(hk, h); }
      h.ids.push(id);
      if(h.total && h.total <= supply * 0.10) rareish.push(hk);
    }
    rareish.sort();
    for(let a = 0; a < rareish.length; a++) for(let b = a + 1; b < rareish.length; b++){
      const pk = rareish[a] + '\u0002' + rareish[b];
      let p = pairs.get(pk);
      if(!p){ p = { a: held.get(rareish[a]), b: held.get(rareish[b]), ids: [] }; pairs.set(pk, p); }
      p.ids.push(id);
    }
    const r = Number(typeof displayRankFor === 'function' ? displayRankFor(id)?.value : 0) || Number(OS_RANK_MAP?.get(id) || RARITY_OBS_RANK?.get(id) || 0);
    if(r && r <= grailCut) grailIds.push(id);
    if(isOcas){
      const visual = comboVisualTraits(entries);
      const text = marketTagText(entries);
      if(visual.type?.value){
        typeCounts.set(visual.type.value, (typeCounts.get(visual.type.value) || 0) + 1);
        if(!typeIds.has(visual.type.value)) typeIds.set(visual.type.value, []);
        typeIds.get(visual.type.value).push(id);
      }
      if(marketTagHas(text, ['diamond'])) diamondIds.push(id);
      if(marketTagHas(text, ['blind eyes'])) blindIds.push(id);
    }
  }
  if(!tokensSeen) return [];

  const tags = [];
  const values = [...held.values()].filter(h => h.total > 0);
  // jv: "Gold for Argonauts is a skin trait, bandana is a head trait" -- a
  // value name alone is ambiguous (Gold can be a skin or a relic), so
  // every tag names the category too, and the label itself includes it
  // whenever the same value name exists in more than one category.
  const _valCats = new Map();
  for(const [k, vs] of Object.entries(TRAIT_FREQ || {})) for(const v of Object.keys(vs)) _valCats.set(v, (_valCats.get(v) || 0) + 1);
  const nameOf = (h) => (_valCats.get(h.v) || 0) > 1 ? `${h.v} ${h.k}` : h.v;
  const fullOf = (h) => `${h.v} (${h.k})`;

  // 1/1s -- a trait value that exists on exactly one token
  const ones = values.filter(h => h.total === 1);
  if(ones.length){
    holderTagAdd(tags, {
      label: ones.length === 1 ? '1/1 Holder' : `${ones.length}× 1/1 Holder`, cls: 'grail',
      detail: ones.length === 1 ? `Owns the only ${ones[0].v} (${ones[0].k})` : `Owns ${ones.length} one-of-one traits: ${ones.slice(0,3).map(fullOf).join(', ')}${ones.length > 3 ? '…' : ''}`,
      ids: ones.flatMap(h => h.ids), score: 110 + ones.length,
    });
  }
  // Grails -- top 1% by rank
  if(grailIds.length){
    holderTagAdd(tags, { label: 'Grail Keeper', cls: 'grail', detail: `Holds ${grailIds.length} top-1% ${colName} (rank ${grailCut} or better)`, ids: grailIds, score: 96 + Math.min(grailIds.length, 10) });
  }
  // Rare traits -- values on 0.5% of the collection or less (2+ copies)
  const rareCut = Math.max(2, Math.floor(supply * 0.005));
  const rare = values.filter(h => h.total >= 2 && h.total <= rareCut).sort((a, b) => a.total - b.total);
  if(rare.length){
    const tokenSet = [...new Set(rare.flatMap(h => h.ids))];
    holderTagAdd(tags, {
      label: rare.length >= 5 ? 'Rare Trait Hunter' : 'Rare Traits', cls: 'combo',
      detail: `${rare.length} trait${rare.length === 1 ? '' : 's'} found on ${rareCut} or fewer ${colName}${rare.length <= 2 ? ': ' + rare.map(fullOf).join(', ') : ''}`,
      ids: tokenSet, score: 90 + Math.min(rare.length, 20) / 2,
    });
  }
  // Cornered a trait -- owns a big share of every copy that exists
  const cornered = values.filter(h => h.total >= 3 && h.ids.length >= 2 && h.ids.length / h.total >= 0.2)
    .sort((a, b) => (b.ids.length / b.total) - (a.ids.length / a.total));
  const whaled = new Set(cornered.slice(0, 2).map(h => h.k + '\u0001' + h.v));
  for(const h of cornered.slice(0, 2)){
    const share = h.ids.length / h.total * 100;
    holderTagAdd(tags, { label: `${nameOf(h)} Whale`, cls: 'drip', detail: `Owns ${h.ids.length} of ${h.total} ${fullOf(h)}, ${pctStr(share)} of all`, ids: h.ids, score: 92 + share / 10 });
  }
  // Full / near-full sets of a trait category
  for(const k of Object.keys(TRAIT_FREQ || {})){
    if(skipCat(k)) continue;
    const all = Object.keys(TRAIT_FREQ[k]).filter(v => !skipVal(v));
    if(all.length < 3 || all.length > 60) continue;
    const have = all.filter(v => held.has(k + '\u0001' + v));
    if(have.length === all.length){
      holderTagAdd(tags, { label: `Full ${k} Set`, cls: 'trait', detail: `Owns all ${all.length} ${k} traits`, ids: have.map(v => held.get(k + '\u0001' + v).ids[0]), score: 94 + all.length / 10 });
    }else if(all.length >= 6 && have.length / all.length >= 0.85){
      holderTagAdd(tags, { label: `${k} Set ${have.length}/${all.length}`, cls: 'trait', detail: `Owns ${have.length} of ${all.length} ${k} traits, missing ${all.filter(v => !have.includes(v)).slice(0,3).join(', ')}${all.length - have.length > 3 ? '…' : ''}`, ids: have.map(v => held.get(k + '\u0001' + v).ids[0]), score: 84 + have.length / all.length * 5 });
    }
  }
  // Clusters -- several tokens sharing the same two uncommon traits
  const clusters = [...pairs.values()].filter(p => p.ids.length >= 3).sort((a, b) => b.ids.length - a.ids.length);
  if(clusters.length){
    const c = clusters[0];
    holderTagAdd(tags, { label: 'Matching Set', cls: 'combo', detail: `${c.ids.length} tokens with ${fullOf(c.a)} + ${fullOf(c.b)}`, ids: c.ids, score: 86 + Math.min(c.ids.length, 12) });
  }
  // Focused collector -- holds a trait far more often than the collection does
  const focus = values.filter(h => h.ids.length >= 3 && h.total > 0)
    .map(h => ({ h, lift: (h.ids.length / tokensSeen) / (h.total / supply) }))
    // common enough that "collecting" it means something (1%-50% of supply),
    // and not already shown as a Whale tag
    .filter(x => x.lift >= 3 && x.h.total >= supply * 0.01 && x.h.total < supply * 0.5 && !whaled.has(x.h.k + '\u0001' + x.h.v))
    .sort((a, b) => (b.lift * Math.log(b.h.ids.length)) - (a.lift * Math.log(a.h.ids.length)));
  for(const { h, lift } of focus.slice(0, 2)){
    holderTagAdd(tags, { label: `${nameOf(h)} Collector`, cls: 'trait', detail: `Holds ${h.ids.length} ${fullOf(h)} (${lift >= 10 ? Math.round(lift) : lift.toFixed(1)}× the collection's rate)`, ids: h.ids, score: 80 + Math.min(lift, 12) / 2 });
  }
  // Trait completionist -- owns a big share of every trait value that exists
  const totalValues = Object.entries(TRAIT_FREQ || {}).filter(([k]) => !skipCat(k)).reduce((n, [, vs]) => n + Object.keys(vs).filter(v => !skipVal(v)).length, 0);
  if(totalValues && values.length / totalValues >= 0.5){
    holderTagAdd(tags, { label: 'Trait Completionist', cls: 'trait', detail: `Owns ${pctStr(values.length / totalValues * 100)} of all ${totalValues} trait values`, ids: cleanIds.slice(0, 16), score: 88 + values.length / totalValues * 5 });
  }
  // OCAS-only flavor
  if(isOcas){
    const TYPE_TAG_DEFS = [
      { pattern:/zombie/i,   label:'Zombie King',   cls:'cursed' },
      { pattern:/ape/i,      label:'Ape Lord',      cls:'grail' },
      { pattern:/skeleton/i, label:'Bone Collector',cls:'cursed' },
      { pattern:/alien/i,    label:'Alien Overlord',cls:'combo' },
      { pattern:/angel/i,    label:'Angel Keeper',  cls:'grail' },
    ];
    for(const [typeName, count] of typeCounts.entries()){
      const def = TYPE_TAG_DEFS.find(d => d.pattern.test(typeName));
      if(!def || count < 3) continue;
      holderTagAdd(tags, { label: def.label, cls: def.cls, detail: `Holds ${count} ${typeName}`, ids: typeIds.get(typeName) || [], score: 85 + count / 2 });
    }
    if(blindIds.length >= 2) holderTagAdd(tags, { label:'Blind Eyes Whale', cls:'combo', detail:`Owns ${blindIds.length} Blind Eyes`, ids:blindIds, score:83 + blindIds.length / 2 });
    if(diamondIds.length >= 3) holderTagAdd(tags, { label:'Diamond Baron', cls:'drip', detail:`Owns ${diamondIds.length} Diamond traits`, ids:diamondIds, score:84 + diamondIds.length / 2 });
  }

  const result = tags.sort((a,b)=>b.score-a.score).slice(0, 8);
  boundedMapSet(HOLDER_TAG_CACHE, key, result, 50);
  return result;
}
function renderHolderTags(tags){
  // All of the tag's token ids (not just 16) so tapping the tag can show them.
  return (tags || []).map(t => `<span class="holder-tag ${comboEsc(t.cls || '')}" role="button" tabindex="0" data-holder-tag="${comboEsc(t.label)}" data-holder-ids="${comboEsc([...new Set(t.ids || [])].slice(0,1000).join(','))}"><b>${comboEsc(t.label)}</b><span>${comboEsc(t.detail || '')}</span></span>`).join('');
}
async function hydrateHolderTags(addr, ids, hostId){
  const host = document.getElementById(hostId);
  if(!host) return;
  host.innerHTML = '';
  const tags = await computeHolderTags(addr, ids);
  _walletTagFilterSet(hostId, null, null);
  host.innerHTML = renderHolderTags(tags);
  host.style.display = tags.length ? 'flex' : 'none';
}

function initHolderTagPreview(){
  const tip = document.getElementById('holderTagPreview');
  if(!tip || tip.dataset.bound) return;
  tip.dataset.bound = '1';
  const isTouch = () => window.matchMedia('(hover: none)').matches || window._tvIsPhone();
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
    const rawIds = String(tag.dataset.holderIds || '').split(',').filter(x => x !== '').map(Number).filter(n => Number.isFinite(n));
    const ids = rawIds.slice(0,8);
    if(!ids.length) return;
    tip.innerHTML = `<div class="holder-tag-preview-title">${comboEsc(tag.dataset.holderTag || 'Holder tag')}</div><div class="holder-tag-preview-grid">${ids.slice(0,8).map(id => {
      const src = typeof _getTokenImgSrc === 'function' ? _getTokenImgSrc(id) : (typeof imgForId === 'function' ? imgForId(id) : '');
      return src ? `<img src="${comboEsc(src)}" alt="#${id}" title="#${id}">` : '';
    }).join('')}</div>${rawIds.length > 8 ? `<div class="holder-tag-preview-more">+${rawIds.length - 8} more</div>` : ''}${tag.closest('#desktopWalletHolderTags, #mobileWalletHolderTags') ? `<div class="holder-tag-preview-more">${tag.classList.contains('active') ? 'Click to show all tokens' : 'Click to show ' + (rawIds.length === 1 ? 'this token' : 'these ' + rawIds.length + ' tokens')}</div>` : ''}`;
    tip.style.display = 'block';
    move(e.clientX, e.clientY);
  }, { passive:true });
  document.addEventListener('pointermove', e => { if(tip.style.display === 'block') move(e.clientX, e.clientY); }, { passive:true });
  document.addEventListener('pointerout', e => { if(e.target.closest?.('.holder-tag[data-holder-ids], .burn-token-thumb[data-burn-token-id]')) hide(); }, { passive:true });
}
document.addEventListener('DOMContentLoaded', initHolderTagPreview);

// jv: "Clicking on those tags in the wallet should bring up the tokens
// associated with that tag. And on desktop a hover display of those tokens
// should show and clicking on it should bring them up." Tapping a tag in
// Wallet View filters that wallet's grid to the tag's tokens (tap again or
// "Show all" to go back). Sort buttons keep working inside the filter.
function _walletTagSide(hostId){ return hostId === 'desktopWalletHolderTags' ? 'desktop' : 'mobile'; }
function _walletTagFilterSet(hostId, label, ids){
  const side = _walletTagSide(hostId);
  window[side === 'desktop' ? '_desktopWalletTagIds' : '_mobileWalletTagIds'] = ids;
  const host = document.getElementById(hostId);
  if(!host) return;
  host.querySelectorAll('.holder-tag').forEach(t => t.classList.toggle('active', !!label && t.dataset.holderTag === label));
  let bar = document.getElementById(hostId + 'Filter');
  if(!ids){ bar?.remove(); return; }
  if(!bar){
    bar = document.createElement('div');
    bar.id = hostId + 'Filter';
    bar.className = 'holder-tag-filter';
    host.insertAdjacentElement('afterend', bar);
  }
  bar.innerHTML = `<span>Showing <b>${ids.length}</b> token${ids.length === 1 ? '' : 's'} · ${comboEsc(label)}</span><button type="button" onclick="_walletTagFilterClear('${hostId}')">✕ Show all</button>`;
}
function _walletTagFilterClear(hostId){
  _walletTagFilterSet(hostId, null, null);
  _walletTagRerender(hostId);
}
function _walletTagRerender(hostId){
  const side = _walletTagSide(hostId);
  const mode = document.querySelector(side === 'desktop' ? '[data-dwsort].active' : '[data-mwsort].active')?.dataset[side === 'desktop' ? 'dwsort' : 'mwsort'] || 'rank';
  if(side === 'desktop') desktopWalletSort(mode); else mobileWalletSort(mode);
}
document.addEventListener('click', e => {
  const tag = e.target.closest?.('#desktopWalletHolderTags .holder-tag[data-holder-ids], #mobileWalletHolderTags .holder-tag[data-holder-ids]');
  if(!tag) return;
  const hostId = tag.parentElement.id;
  const side = _walletTagSide(hostId);
  const walletIds = new Set((side === 'desktop' ? window._desktopWalletIds : window._mobileWalletIds) || []);
  const ids = String(tag.dataset.holderIds || '').split(',').filter(x => x !== '').map(Number).filter(n => walletIds.has(n));
  if(tag.classList.contains('active') || !ids.length){ _walletTagFilterClear(hostId); return; }
  _walletTagFilterSet(hostId, tag.dataset.holderTag, ids);
  _walletTagRerender(hostId);
  const tip = document.getElementById('holderTagPreview'); if(tip) tip.style.display = 'none';
});
document.addEventListener('keydown', e => {
  if(e.key !== 'Enter' && e.key !== ' ') return;
  const tag = e.target.closest?.('.holder-tag[data-holder-ids]');
  if(tag){ e.preventDefault(); tag.click(); }
});

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
  html += `<div style="font-size:11px;color:var(--sub);margin-bottom:10px">Each trait's contribution to overall rarity score (rarer trait = higher % contribution)</div>`;

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

  html += `<div style="margin-top:10px;font-size:11px;color:var(--sub);border-top:1px solid var(--border);padding-top:8px">
    Total rarity score: <b>${totalScore.toFixed(2)}</b> &nbsp;•&nbsp;
    ${traitScores.length} traits &nbsp;•&nbsp;
    Bar width = % contribution to score
  </div>`;

  html += `
  <div id="comboInsightsPanel" class="combo-insights-panel">
    <div class="combo-insights-head">
      <div class="combo-insights-title">
        Combo Intelligence
        <div class="combo-insights-sub">Objective rarity relationships from loaded traits</div>
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
    <text x="${PAD}" y="${ty(maxEth).toFixed(1)-4}" fill="#9ab0c8" font-size="10">${['ETH','WETH'].includes(points[0]?.symbol) || !points[0]?.symbol ? 'Ξ' : ''}${maxEth.toFixed(4)}${!['ETH','WETH'].includes(points[0]?.symbol) && points[0]?.symbol ? ' '+points[0].symbol : ''}</text>
    <text x="${PAD}" y="${ty(minEth).toFixed(1)+12}" fill="#9ab0c8" font-size="10">${['ETH','WETH'].includes(points[0]?.symbol) || !points[0]?.symbol ? 'Ξ' : ''}${minEth.toFixed(4)}${!['ETH','WETH'].includes(points[0]?.symbol) && points[0]?.symbol ? ' '+points[0].symbol : ''}</text>
    ${points.map(p=>`<circle cx="${tx(p.ts).toFixed(1)}" cy="${ty(p.eth).toFixed(1)}" r="4" fill="${p.symbol === 'WETH' ? '#f87171' : '#2dd4bf'}" stroke="var(--panel)" stroke-width="2">
      <title>${new Date(p.ts).toLocaleDateString()} — Ξ${p.eth.toFixed(4)} ${p.symbol}</title>
    </circle>`).join('')}
  </svg>`;

  // Sale list below chart
  html += '<div style="margin-top:8px;display:flex;flex-direction:column;gap:4px;max-height:120px;overflow:auto">';
  for(const p of [...points].reverse()){
    const date = new Date(p.ts).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});
    const saleColor = p.symbol === 'WETH' ? '#f87171' : '#7dd3fc';
    html += `<div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-bottom:1px dashed var(--chip-b)">
      <span style="color:var(--text);font-weight:700">${date}</span>
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

// The element that actually scrolls the page around the mobile grid:
// the nearest ancestor that is really scrollable (on this site usually
// <body>, since html,body{height:100%;overflow-x:hidden} makes body the
// scroller), falling back to the document's own scroller.
function _vsPageScroller(el){
  for(let n = el && el.parentElement; n && n !== document.documentElement; n = n.parentElement){
    const oy = getComputedStyle(n).overflowY;
    if((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return document.scrollingElement || document.documentElement;
}

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
    const url = `${LIVE_ENDPOINT}/os/collection-listings?slug=${encodeURIComponent(LIVE_SLUG)}&contract=${encodeURIComponent(LIVE_CONTRACT)}&chain=${LIVE_CHAIN}`;
    const r = await fetch(url, { cache: 'no-store' });
    LIVE_OK = r.ok;
    if(!r.ok) throw new Error('HTTP '+r.status);
    const j = await r.json();
    // Worker returns { ok, listings: { tokenId: { opensea: { price, price_eth, url } } } }
    const listingsData = j.listings || j;
    // Normalize: ensure price_eth is always a proper float for every entry
    // jv: "the listings for nekoadz arent showing[,] 0 Eth and it
    // should be showing a price in USDG." Same bug class already fixed
    // once for the floor price display (fetchFloor() above) -- parsing
    // a raw price value assuming ETH's 18 decimals regardless of the
    // collection's actual currency. USDG (like most stablecoins) uses
    // 6 decimals, not 18 -- a raw value of 12000000 (12 USDG) divided
    // by 1e18 instead of 1e6 rounds down to effectively zero. Can't
    // confirm the exact raw shape /os/collection-listings actually
    // returns for a listing like this without live data though (unlike
    // the floor price case, where the raw stats response was already
    // logged and confirmed) -- logging one raw entry once, the same
    // pattern as that fix, so the real shape is visible rather than
    // guessing at a second currency conversion blind.
    for(const [k,v] of Object.entries(listingsData)){
      if(v && v.opensea){
        v.opensea.source = 'live';
        // price_eth may already be set by worker; if not, derive from price (wei string)
        if(v.opensea.price_eth == null || v.opensea.price_eth === 0){
          const rawBefore = v.opensea.price;
          v.opensea.price_eth = parseEthMaybeWei(v.opensea.price);
          if(!window.__loggedListingsShape && v.opensea.price_eth != null && v.opensea.price_eth < 0.001 && rawBefore != null){
            window.__loggedListingsShape = true;
            console.log(`[Listings] [${LIVE_SLUG}] suspiciously tiny price_eth (${v.opensea.price_eth}) from raw price:`, rawBefore, '-- full entry:', JSON.stringify(v));
          }
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
    // Same fix as the ?jump= fast path -- an exact single-ID jump means
    // the user wants to see that specific token regardless of listing state.
    await renderTokenGrid(finalIds, { skipListedFilter: exact });
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
  if(window._tvIsPhone()){
    // mobile: the page is the scroller (see VS.init)
    const sc = _vsPageScroller(tg);
    const top = sc.scrollTop + tg.getBoundingClientRect().top + row * (cellH + gap);
    sc.scrollTo({ top, behavior: 'smooth' });
  } else {
    tg.scrollTo({ top: row * (cellH + gap), behavior: 'smooth' });
  }
}
/* init */
// Flag: true while background chunk loading is in progress
// Prevents background updateChartAndList() from stomping on a user-initiated
// prefix filter or jump that was set after init started
window.__INIT_LOADING__ = false;

// ── Live sale feedback ───────────────────────────────────────────────────────
// jv asked for the grid to update instantly when a token sells. Backend
// holds one persistent OpenSea Stream connection per collection (the API
// key can never be exposed to the browser) and relays item_sold events to
// this page over Server-Sent Events -- see lib/sale-stream.js on the
// backend for the full architecture writeup.
let _saleStreamSource = null;

function connectSaleStream(){
  // Confirmed live pattern from this session: a collection switch must
  // close out anything scoped to the previous collection before opening
  // the new one, same as CHUNK_CACHE/VS._nodeCache/etc already are in
  // resetCollectionState() -- an EventSource left open from a previous
  // collection would keep delivering that OTHER collection's sale events
  // into whatever's currently on screen.
  if(_saleStreamSource){
    _saleStreamSource.close();
    _saleStreamSource = null;
  }
  if(!RAILWAY_API || !LIVE_SLUG) return;
  const url = `${RAILWAY_API}/db/sales-stream?slug=${encodeURIComponent(LIVE_SLUG)}&key=${encodeURIComponent(RAILWAY_KEY)}`;
  const source = new EventSource(url);
  _saleStreamSource = source;
  source.onmessage = (ev) => {
    if(!ev.data || ev.data.startsWith(':')) return; // keep-alive comment lines
    let msg;
    try{ msg = JSON.parse(ev.data); }catch{ return; }
    if(msg?.type === 'sale' && msg.tokenId != null) _handleTokenSold(msg);
  };
  // EventSource auto-reconnects on its own after a network hiccup -- no
  // manual retry loop needed, just avoid spamming the console on the
  // inevitable disconnect when the user navigates away or switches tabs.
  source.onerror = () => { /* browser will retry automatically */ };
}

function _handleTokenSold(msg){
  const id = +msg.tokenId;
  // The grid's own "is this listed" check reads window.LISTINGS[id] directly
  // (renderTokenGrid's onlyListed branch) -- removing it here is what
  // actually makes a sold token disappear from the Live Listings view,
  // not just a visual flourish.
  if(window.LISTINGS && window.LISTINGS[id]) delete window.LISTINGS[id];

  // Flash a brief "SOLD" banner on the tile if it's currently on screen,
  // then let the grid settle back to whatever it should show next.
  const tile = document.querySelector(`[data-id="${id}"]`);
  if(tile){
    const flash = document.createElement('div');
    const flashSym = window._liveCurrencySymbol || 'ETH';
    flash.textContent = `SOLD${msg.priceEth != null ? ' · ' + (['ETH','WETH'].includes(flashSym) ? 'Ξ' : '') + Number(msg.priceEth).toFixed(4) + (['ETH','WETH'].includes(flashSym) ? '' : ' '+flashSym) : ''}`;
    flash.style.cssText = 'position:absolute;inset:0;z-index:5;display:flex;align-items:center;justify-content:center;background:rgba(220,38,38,.88);color:#fff;font-weight:800;font-size:13px;letter-spacing:.5px;border-radius:inherit;pointer-events:none;animation:tvSoldFade 3s ease forwards';
    if(!document.getElementById('tvSoldFadeKeyframes')){
      const style = document.createElement('style');
      style.id = 'tvSoldFadeKeyframes';
      style.textContent = '@keyframes tvSoldFade{0%{opacity:0}10%{opacity:1}75%{opacity:1}100%{opacity:0}}';
      document.head.appendChild(style);
    }
    tile.style.position = tile.style.position || 'relative';
    tile.appendChild(flash);
    setTimeout(() => {
      flash.remove();
      const onlyListed = document.getElementById('onlyListed')?.checked;
      // Only re-render if Live Listings is on -- that's the one view where
      // a sold token should actually vanish. With it off, the token stays
      // visible (it still exists, it's just no longer for sale), matching
      // how the rest of the grid already treats unlisted tokens.
      if(onlyListed && typeof renderTokenGridFromState === 'function') renderTokenGridFromState();
    }, 3000);
  }

  // If the modal happens to be open on the exact token that just sold,
  // refresh it so the listing/price display doesn't show a stale price.
  // _modalCurrentId alone isn't enough -- it can still hold the last-opened
  // id after the modal's been closed, same distinction openModal's own
  // fresh-image logic already draws elsewhere.
  const modalEl = document.getElementById('modal');
  if(window._modalCurrentId === id && modalEl?.style.display !== 'none' && typeof openModal === 'function') openModal(id);
}

async function init(){
  try{
    populateCollectionSwitcher();
    applyCollectionFeatureGating();
    applyCollectionBannerHeader();

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
              for(const {token_id, price_eth, url, currency} of data.listings){
                listingsData[token_id] = {
                  opensea: { price_eth: price_eth, url, currency: currency || 'ETH', source: 'db' }
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
            const url = `${LIVE_ENDPOINT}/os/collection-listings?slug=${encodeURIComponent(LIVE_SLUG)}&contract=${encodeURIComponent(LIVE_CONTRACT)}&chain=${LIVE_CHAIN}`;
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
          if(window._tvIsPhone() && VS.enabled) VS.refreshPrices();
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
          if(window._tvIsPhone() && typeof stampMobilePrices === 'function') stampMobilePrices();
          if(window._tvIsPhone() && document.getElementById('tokenGrid')?.classList.contains('list')) _stampMobileListRows();
          // Refresh images for top listed tokens in background
          if(typeof _refreshListedTokenImages === 'function') _refreshListedTokenImages();

          // Re-render grid and re-apply view mode so price badges appear on all views
          // Confirmed live: when "Live Listings" (onlyListed) is checked, the
          // ENTIRE set of tokens the grid shows depends on window.LISTINGS
          // (renderTokenGrid's onlyListed branch filters ids down to only
          // those with an actual listing) -- not just a price-badge overlay
          // on already-existing tiles. If listings arrive after the initial
          // render (a genuine race -- listings load in the background,
          // separately from the main init() flow), the first render would
          // have shown zero tiles at all (nothing to filter down to yet),
          // and VS.refreshPrices() below (mobile's normal path) has nothing
          // to refresh since no tiles exist. This needs a full re-render
          // regardless of mobile/desktop specifically for the onlyListed
          // case -- the desktop-only gate below is still correct for the
          // normal case (onlyListed off), where tiles already exist and
          // only need their price badge added.
          const _onlyListedNow = document.getElementById('onlyListed')?.checked;
          if((!window._tvIsPhone() || _onlyListedNow) && typeof renderTokenGridFromState === 'function'){
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
          if(!window._tvIsPhone()){
            const tg = document.getElementById('tokenGrid');
            if(tg && tg.classList.contains('compact') && typeof applyViewMode === 'function') applyViewMode('compact');
            // Refresh list view price cells now that listings are loaded
            if(tg && tg.classList.contains('list')){
              tg.querySelectorAll('.token[data-id]').forEach(card => {
                const id = +card.dataset.id;
                const eth = typeof getListingEth==='function' ? getListingEth(id) : null;
                const priceStr = eth!=null ? (eth>=1?eth.toFixed(3):eth.toFixed(4)) : null;
                // jv: "seems that whenever we fix the listing price
                // display for mobile it goes back to showing 0 eth on
                // desktop and vice versa." This is exactly why -- the
                // desktop list-view's own price cell update (this
                // block, !window._tvIsPhone() only) is a completely
                // separate code path from the mobile stamping function
                // (stampMobilePrices()) that had the exact same
                // hardcoded "Ξ" bug fixed there. Neither one ever
                // touched the other, so a fix in one never showed up
                // in the other -- not an actual regression each time.
                const listSym = (window.LISTINGS?.[id]?.opensea?.currency || 'ETH').toUpperCase();
                const priceDisplay = priceStr ? (['ETH','WETH'].includes(listSym) ? 'Ξ '+priceStr : priceStr+' '+listSym) : null;
                // Update listed price cell
                const pCell = card.querySelector('[data-price-id]');
                if(pCell){ pCell.textContent = priceDisplay || 'Not listed'; pCell.className = 'vs-val '+(priceDisplay?'green':'muted'); }
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
    // ?token= is also sent by several bot commands/embeds (commands/ocas.js,
    // commands/burn.js, commands/token.js) but was never actually read here --
    // only ?jump= was handled, so every one of those links silently did
    // nothing beyond loading the homepage. Treat it as an alias.
    const jumpId  = urlParams.get('jump') || urlParams.get('token');
    const jumpNum = jumpId && Number.isFinite(+jumpId) && +jumpId > 0 ? +jumpId : null;

    // Detect ?wallet= -- deep-link into the Wallet analytics tab for a
    // specific address, sent by the bot's /me Portfolio embed. Being bot-
    // verified in a Discord server (required to see that embed at all) is a
    // DIFFERENT check than being linked to TraitView itself (the separate
    // Discord<->wallet link tracked in traitview_links, via the 6-digit
    // code flow / ?verify=true) -- someone could otherwise craft this URL
    // for any address and see its analytics with no proof they're the
    // owner. So: check TraitView's own link status for this address first;
    // only load analytics if it's actually linked, otherwise show the
    // Discord Verify modal and direct them to link it instead of silently
    // rendering a stranger's wallet.
    // jv: "after opening wallet tracking notification it opens up to the
    // wallet history chart" -- watched-wallet alerts link here with
    // ?whist=<wallet>&wtoken=<id>. Public on-chain history, so no linked-
    // wallet gate (unlike ?wallet= below).
    const whistParam = urlParams.get('whist');
    if(whistParam && /^0x[0-9a-fA-F]{40}$/.test(whistParam.trim())){
      const wt = parseInt(urlParams.get('wtoken'), 10);
      setTimeout(() => tvOpenWalletHistory(whistParam.trim(), Number.isFinite(wt) ? wt : null), 0);
    }
    const walletParam = urlParams.get('wallet');
    if(walletParam && /^0x[0-9a-fA-F]{40}$/.test(walletParam.trim())){
      const walletAddr = walletParam.trim();
      setTimeout(async () => {
        let linked = false;
        if(typeof tvCheckLinkStatus === 'function'){
          try{
            await tvCheckLinkStatus(walletAddr);
            linked = !!(typeof TV_DISCORD_LINK !== 'undefined' && TV_DISCORD_LINK && String(TV_DISCORD_LINK.wallet||'').toLowerCase() === walletAddr.toLowerCase());
          }catch(_){}
        }
        if(linked){
          if(typeof switchTopTab === 'function') switchTopTab('wallet');
          if(typeof requestWalletAnalyticsLoad === 'function'){
            requestWalletAnalyticsLoad(walletAddr, { force: true, allowHiddenFetch: true }).catch(() => {});
          }
        } else if(typeof tvShowDiscordVerifyModal === 'function'){
          tvShowDiscordVerifyModal({ wallet: walletAddr });
        }
      }, 0);
    }

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
          // Survivor counts/images and the burned-ticker below only apply to
          // collections with an actual burn lifecycle (hasBurnMechanic:true
          // in the registry -- currently just OCAS). Gating here avoids
          // pointless requests to endpoints that don't apply at all for a
          // collection like Argonauts, plus recurring setInterval polling
          // forever for data that will never be relevant.
          if(COLLECTIONS[LIVE_SLUG]?.hasBurnMechanic){
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
          // Ground-truth current image for every burn survivor, straight
          // from burn_state_snapshots -- see /db/survivor-images. Loaded
          // once alongside survivor counts, same TTL-refresh pattern.
          // _getTokenImgSrc/_imgSrc check this BEFORE the OpenSea-live-fetch
          // path, since OpenSea's own indexing can lag behind the real
          // on-chain state (confirmed directly on token #4527).
          if(!window.SURVIVOR_IMAGE_MAP || window.SURVIVOR_IMAGE_MAP.size === 0){
            const loadSurvivorImages = () => dbFetch('/db/survivor-images')
              .then(j => {
                if(j?.ok && j.images){
                  window.SURVIVOR_IMAGE_MAP = new Map(Object.entries(j.images).map(([id,img]) => [+id, img]));
                }
              }).catch(()=>{});
            loadSurvivorImages();
            setInterval(loadSurvivorImages, 10 * 60 * 1000);
          }
          } // end hasBurnMechanic gate
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
    // Confirmed live: loadImagesMap() only ever has data to find for OCAS
    // (its static ./data/token_images*.json files have no equivalent for
    // any other collection) -- skip the request entirely for anything else,
    // now that _getTokenImgSrc() reads the live DB's CHUNK_CACHE-warmed
    // image data directly instead.
    const imagesPromise = (LIVE_SLUG === 'on-chain-all-stars') ? loadImagesMap() : Promise.resolve();
    loadProbabilities();
    window.__INIT_LOADING__ = true;
    startBackgroundListingsLoad();
    connectSaleStream();

    // Fetch all surviving tokens' traits from DB — replaces static chunk files.
    // Server caches for 5 min so this is fast for all visitors after the first.
    // Falls back to static chunks if DB fetch fails.
    // Capture the generation NOW, before the fetch even starts -- if a
    // collection switch happens while this is in flight, resetCollectionState
    // bumps window._collectionGeneration, and the check below discards this
    // fetch's result entirely rather than letting a stale, wrong-collection
    // response silently overwrite CHUNK_CACHE after a newer switch already
    // populated it correctly. This was confirmed live: a token's raw fetch
    // response had a genuinely valid image, yet the same token rendered as
    // undefined -- meaning something applied AFTER the correct data landed.
    const _fetchGen = window._collectionGeneration || 0;
    // lazyImages=1: SVG/on-chain collections get each token's image as a
    // URL to /db/token-image instead of the full image inline (Argonauts'
    // slow first load -- one huge response). Backends without support
    // just ignore the param and send the old inline format.
    const allTraitsPromise = dbFetch('/db/all-traits', { lazyImages: 1 })
      .then(data => {
        if (!data?.ok || !data.tokens) throw new Error('no data');
        if ((window._collectionGeneration || 0) !== _fetchGen) {
          console.warn('[TraitView] Discarding stale all-traits response (gen ' + _fetchGen + ', now ' + window._collectionGeneration + ') -- a newer collection switch happened while this was in flight');
          return data;
        }
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
        // Anything looked up before this data arrived must not stick.
        if (LIVE_SLUG !== 'on-chain-all-stars' && typeof ROW_CACHE !== 'undefined') ROW_CACHE.clear();
        // Store burned token IDs for grid filtering.
        // Confirmed live: this loop always ran 1..10000 unconditionally --
        // hardcoded to OCAS's own supply/ID range. For a collection with a
        // different total supply or non-sequential IDs (Argonauts included),
        // this would mark plenty of genuinely valid, non-burned tokens as
        // "burned" simply because they sit outside 1-10000 or because this
        // collection's own supply is smaller, hiding them from the grid
        // entirely via renderTokenGrid's _BURNED_IDS filter. Only OCAS
        // actually has a burn mechanic at all (hasBurnMechanic in the
        // collections registry) -- skip entirely for anything else rather
        // than iterate a range that was never meaningful for other
        // collections in the first place.
        window._BURNED_IDS = new Set();
        if(LIVE_SLUG === 'on-chain-all-stars'){
          for (let id = 1; id <= 10000; id++) {
            if (!data.tokens[String(id)]) window._BURNED_IDS.add(id);
          }
        }
        // General, contract-agnostic "sent to a known dead address" flag
        // (tokens.is_burned via lib/burn-detect.js, exposed per-token as
        // row.burned) -- distinct from _BURNED_IDS above, which means
        // "excluded from this response entirely" (OCAS's own fusion-burn
        // survivors only). This set is for tokens that ARE still present
        // in the response and should stay visible with a badge, not
        // filtered out of the grid -- jv wants the collection's own
        // updated "burning" artwork shown, not the token hidden. Kept
        // synchronous (built once here) so the mobile virtual-scroller
        // card builders, which deliberately avoid any per-card async
        // fetch, can badge it without adding a network call per card.
        window._BURNED_TOKEN_SET = new Set();
        for (const [sid, row] of Object.entries(data.tokens)) {
          if (row?.burned) window._BURNED_TOKEN_SET.add(+sid);
        }
        console.log('[TraitView] Loaded ' + Object.keys(data.tokens).length + ' live tokens from DB');
        return data;
      })
      .catch(err => {
        console.warn('[TraitView] DB traits fetch failed, falling back to chunks:', err.message);
        // Fallback: load static chunk files as before.
        // Confirmed live: this never actually waited for these fetches to
        // complete before -- .forEach() does not await its async callback,
        // so `await allTraitsPromise` below only ever waited for this
        // .catch() handler itself to return, not for CHUNK_CACHE to
        // actually be populated. Everything after this point in init()
        // (including the eventual grid render) could run while these
        // fetches were still in flight, exactly the "chunk not in
        // CHUNK_CACHE" symptom jv's diagnostic confirmed directly.
        return Promise.all(indices().map(idx => ensureChunk(idx))).then(() => null);
      });
    // Exposed globally so _getTokenImgSrcAsync() (called much later, e.g.
    // from a chart hover, long after init() has returned) can await
    // whatever's left of this exact fetch rather than having no way to
    // wait for it at all -- awaiting an already-settled promise is safe
    // and simply resolves immediately, so this works whether the hover
    // happens before or long after this fetch actually completes.
    window._allTraitsPromise = allTraitsPromise;

    await allTraitsPromise;

    // ── ?jump= fast path ──────────────────────────────────────────────────────
    if(jumpNum){
      document.getElementById('jump').value = String(jumpNum);

      // jv confirmed live: an Argonauts jump link's token image never
      // loaded. allTraitsPromise (just awaited above) already correctly
      // warms CHUNK_CACHE for any collection via the proper DB-backed
      // fetch -- this direct ensureChunk() call was not just redundant
      // for a successful load, it was actively harmful: ensureChunk()
      // always fetches OCAS's own static /data/chunks/ files regardless
      // of collection (same bug class already fixed in
      // _getTokenImgSrcAsync and elsewhere), so it could silently
      // overwrite the already-correct CHUNK_CACHE entry with a same-
      // numbered OCAS token's wrong data. Only needed for OCAS, where
      // CHUNK_CACHE really is backed by these per-chunk static files.
      if(LIVE_SLUG === 'on-chain-all-stars') await ensureChunk(chunkIndexFor(jumpNum));
      await imagesPromise;

      // Show ONLY this token immediately. jv confirmed live: clicking a
      // Discord sale/listing embed's TraitView link landed on an empty
      // grid whenever "Live Listings" happened to be checked and the
      // target token wasn't currently listed -- exactly the case for a
      // sale link, since a token that just sold is by definition no
      // longer listed. skipListedFilter shows the specific token a jump
      // link was asked to show regardless of the Live Listings toggle,
      // without changing that toggle's actual state for the rest of the
      // session.
      await renderTokenGrid([jumpNum], { skipListedFilter: true });

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
          await renderTokenGrid([jumpNum], { skipListedFilter: true });
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
    // jv: "Chart is not loading fully again." This used to run its own,
    // separate fetch here -- a direct OpenSea call capped at 10 pages
    // (1000 events, newest-first), which set window._floorLoaded = true
    // on completion. loadFloorTrend() (the DB-backed, actually-complete
    // path -- LIMIT 20000, or a 150-page OpenSea fallback if that fails)
    // already checks that same flag before deciding whether to fetch at
    // all -- so if this old, capped pre-load finished first (easily
    // possible, well within 4 seconds), it won the race and left
    // window._floorLoaded permanently true with only a partial, recent-
    // only dataset. Any tab opened after that (Floor Trend, Sale Chart)
    // saw _floorLoaded already true and skipped the real fetch entirely,
    // rendering whatever sliver of the actual 30/90/180-day range that
    // capped fetch happened to cover -- which for an active collection
    // can be as little as a handful of days, not the range actually
    // selected. Calling loadFloorTrend() itself here instead keeps the
    // same "have it ready before the user opens the tab" intent, just
    // through the one correct, complete path everything else already
    // uses, rather than a second, older, incomplete one racing against
    // it. loadFloorTrend() already no-ops if something else already
    // triggered and finished a real load by the time this fires.
    setTimeout(() => { loadFloorTrend(false); }, 4000); // 4 second delay — staggered after listings

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
// ── Keep the collection banner from ever bleeding through an open overlay ──
// jv: "the banner is sitting on top of the analytics and trait filter
// panels... it needs to sit behind everything." Both of those overlays
// (#filtersColumn, #mobileAnalyticsSheet) -- and the wallet/holder
// drawers, and the main token modal -- have their own translucent,
// blurred backgrounds by design, so anything positioned behind them,
// correctly per z-index, still shows through blurred. Chasing this one
// overlay-open trigger at a time (body.drawer-active for the filter
// drawer specifically) is exactly how the analytics sheet -- a
// completely separate element with its own separate open/close
// mechanism -- got missed entirely. Rather than instrument every
// individual open/close call site (several of the close paths are
// inline onclick handlers scattered across index.html, not even a
// single named function each), this watches all of them directly and
// reacts to their actual state: if ANY of them is open, the banner is
// forced hidden, full stop, regardless of which one it is or how it
// got triggered.
(function bannerOcclusionGuard(){
  const banner = document.getElementById('collectionBannerHeader');
  if(!banner) return;
  const classBased = ['filtersColumn', 'mobileAnalyticsSheet', 'mobileWalletDrawer', 'mobileHolderDrawer']
    .map(id => document.getElementById(id)).filter(Boolean);
  const modal = document.getElementById('modal');
  function anyOverlayOpen(){
    if(classBased.some(el => el.classList.contains('open') || el.classList.contains('drawer-open'))) return true;
    if(modal && getComputedStyle(modal).display !== 'none') return true;
    return false;
  }
  function recheck(){
    banner.classList.toggle('force-hidden', anyOverlayOpen());
  }
  const targets = modal ? [...classBased, modal] : classBased;
  const mo = new MutationObserver(recheck);
  targets.forEach(t => mo.observe(t, { attributes:true, attributeFilter:['class','style'] }));
  recheck();
})();

(function initLiveListingsDefault(){
  // jv: "clicking on a the traitview link from the bot takes me to
  // traitview for that token but switches over to live listings." This
  // ran unconditionally on every page load, including one landing on a
  // specific token via ?jump=/?token= (every bot embed's "View on
  // TraitView" link) -- skipListedFilter (see renderTokenGrid's own
  // ?jump= handling) already makes sure the token itself still shows
  // correctly either way, but the pill still visibly flipped to its "on"
  // state the instant the page loaded, which reads as the page having
  // switched modes on you even though the single token you followed the
  // link to see was never actually hidden by it.
  const urlParams = new URLSearchParams(window.location.search);
  if(urlParams.get('jump') || urlParams.get('token')) return;
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
          for(const {token_id, price_eth, url, currency} of data.listings){
            window.LISTINGS[token_id] = { opensea: { price_eth, url, currency: currency || 'ETH', source: 'db' } };
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
  if(name === 'salechart'){
    if(window._floorLoaded && window._floorEvents?.length){
      setTimeout(renderSaleChart, 80);
    } else {
      // Same underlying dataset as Floor Trend -- loadFloorTrend() already
      // calls renderFloorTrend() once it resolves, not this. Chain onto it
      // rather than duplicating the fetch.
      loadFloorTrend(false).then(()=>{
        if(_isSaleChartTabVisible()) renderSaleChart();
      });
    }
  }
  if(name === 'holders'){
    if(!window._holdersLoaded) loadHolders(false);
    else _applyHoldersTraitFilter(); // apply current trait filter if already loaded
  }
  if(name === 'wallet') requestWalletAnalyticsLoad(CONNECTED_WALLET?.address).catch(()=>{});
  if(name === 'burns' && typeof loadBurnsAnalytics === 'function') loadBurnsAnalytics(false).catch(()=>{});
  if(name === 'burned' && typeof renderBurnedTokensTab === 'function') renderBurnedTokensTab();
  if(name === 'pulse' && typeof loadTraitPulse === 'function') loadTraitPulse();
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
              for(const {token_id, price_eth, url, currency} of data.listings){
                listingsData[token_id] = { opensea: { price_eth, url, currency: currency || 'ETH', source: 'db' } };
              }
              window.LISTINGS = Object.assign({}, window.LISTINGS, listingsData);
              LIVE_OK = true;
              const _fb = document.getElementById('btnFetch'); if(_fb) _fb.style.display='none';
            }
          } catch(dbErr){
            console.warn('DB listings failed for mispriced, falling back:', dbErr.message);
            const url = LIVE_ENDPOINT+'/os/collection-listings?slug='+encodeURIComponent(LIVE_SLUG)+'&contract='+encodeURIComponent(LIVE_CONTRACT)+'&chain='+encodeURIComponent(LIVE_CHAIN);
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
  if(!window._tvIsPhone()) return;
  document.body.style.overscrollBehavior = 'none';
  const sheet   = document.getElementById('mobileAnalyticsSheet');
  const overlay = document.getElementById('mobileAnalyticsOverlay');
  const inner   = document.getElementById('mobileAnalyticsInner');
  if(!sheet || !inner) return;

  // jv: "I don't see anywhere on mobile to filter the trait and traits
  // counts" while viewing Sales. Confirmed live: this sheet and
  // #mobileBottomBar are both position:fixed;bottom:0, and this sheet's own
  // z-index (601) sits above the bottom bar's (500) -- meaning the sheet's
  // own DOM physically covers the bottom bar's entire clickable area
  // whenever it's open, even though the bar's semi-transparent background
  // can still make it look visible underneath. The filter icon in that bar
  // (which opens #filtersColumn, the actual trait/trait-count filter UI)
  // was completely unreachable this whole time whenever this sheet was
  // open -- not a discoverability problem, an actual click-blocking one.
  // Same fix pattern as the earlier hamburger-menu-hides-behind-the-bar
  // bug: measure the bar's real, rendered height and shift the sheet's own
  // bottom position up by that amount, so it never physically overlaps the
  // bar's clickable area at all, on any device's actual safe-area-inset.
  const bar = document.getElementById('mobileBottomBar');
  const barHeight = bar ? bar.getBoundingClientRect().height : 60;
  sheet.style.bottom = `${barHeight}px`;
  if(overlay) overlay.style.bottom = `${barHeight}px`;

  // Build lightweight tab UI — no DOM moves, no large elements
  const isMob = window._tvIsPhone();
  const _hasBurn = (typeof COLLECTIONS !== 'undefined' && typeof LIVE_SLUG !== 'undefined' && COLLECTIONS[LIVE_SLUG]?.hasBurnMechanic) || false;
  const tabs = (isMob
    ? ['chart','sales','burns','burned','mispriced','pulse','floor','salechart','holders','wallet']
    : ['chart','sales','burns','burned','mispriced','pulse','scatter','floor','salechart','holders','wallet']
  ).filter(t => (t !== 'burns' || _hasBurn) && (t !== 'burned' || !_hasBurn));
  const labels = {chart:'Traits',sales:'Sales',mispriced:'Mispriced',pulse:'🔥 Pulse',scatter:'Price vs Rank',floor:'Floor Trend',salechart:'Sale Chart',holders:'Holders',wallet:'Wallet',burns:'Burns',burned:'Burned'};
  const curActive = document.querySelector('.top-tab.active')?.dataset?.ttab || 'chart';

  // Reset inner to just the skeleton — no panel content yet
  inner.innerHTML =
    `<div style="display:flex;overflow-x:auto;gap:4px;padding:4px 0 8px;scrollbar-width:none;-webkit-overflow-scrolling:touch" id="analyticsSheetTabs">` +
    tabs.map(t =>
      `<button data-stab="${t}" onclick="switchAnalyticsSheetTab('${t}')" style="flex-shrink:0;padding:7px 12px;border-radius:8px;border:1px solid color-mix(in srgb, var(--text) ${t===curActive?'30%':'10%'}, transparent);background:color-mix(in srgb, var(--text) ${t===curActive?'10%':'4%'}, transparent);color:${t===curActive?'var(--text)':'var(--sub)'};font-size:12px;font-weight:600;cursor:pointer;font-family:'Space Grotesk',sans-serif;white-space:nowrap">${labels[t]}</button>`
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
    // theme-aware (was hardcoded white tints -- invisible on the light theme)
    b.style.background = active ? 'color-mix(in srgb, var(--text) 10%, transparent)' : 'color-mix(in srgb, var(--text) 4%, transparent)';
    b.style.borderColor = active ? 'color-mix(in srgb, var(--text) 30%, transparent)' : 'color-mix(in srgb, var(--text) 10%, transparent)';
    b.style.color = active ? 'var(--text)' : 'var(--sub)';
  });

  const body = document.getElementById('analyticsSheetBody');
  if(!body) return;

  const tabs = ['chart','sales','burns','burned','mispriced','pulse','scatter','floor','salechart','holders','wallet'];
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

  // jv: "The sales chart is running off the bottom of the screen now."
  // A fixed 400px guess for the chart host didn't account for how much
  // of the sheet's own visible height (82dvh, itself device-dependent)
  // gets used by everything ABOVE the chart -- which can also vary in
  // height itself (active trait chips, a two-line description wrap,
  // etc). Measures what's genuinely left after that content has
  // actually been laid out and fits the chart to it, rather than a
  // static number that's either too small on some screens/states or
  // spills past the visible sheet on others. Deliberately NOT a
  // separately-timed setTimeout -- an earlier one of those for Floor
  // Trend specifically caused "flashes on then vanishes" (a stale,
  // independently-scheduled resize racing the actual render). This is
  // meant to be called chained directly after the real render, with a
  // visibility check first so a late callback from a tab the user has
  // since left alone never touches anything.
  function _fitMobileSheetChartHeight(hostId, panelId, minH, maxH){
    const panel = document.getElementById(panelId);
    if(!panel || panel.style.display === 'none') return; // user already switched away
    const host = document.getElementById(hostId);
    const sheet = document.getElementById('mobileAnalyticsSheet');
    if(!host || !sheet) return;
    const available = Math.round(sheet.getBoundingClientRect().bottom - host.getBoundingClientRect().top - 16);
    const h = Math.max(minH, Math.min(available, maxH));
    if(Math.abs(host.clientHeight - h) < 4) return; // already close enough, avoid a no-op resize
    host.style.height = h + 'px';
    try{ Plotly.Plots.resize(hostId); }catch(e){}
  }

  if(name === 'chart'){
    // Constrain chart host height for mobile
    const ch = document.getElementById('chartHost');
    if(ch) ch.style.height = '240px';
    setTimeout(()=>{ try{ Plotly.Plots.resize('chartHost'); }catch(e){} }, 100);
  }
  if(name === 'floor'){
    const fh = document.getElementById('floorTrendHost');
    // jv: "The floor trend panel should also be bigger... It's a lot of
    // vertical data with the chart so should be more room to display
    // it." then "The sales chart is running off the bottom of the
    // screen now" -- a fixed pixel guess (400px) didn't account for
    // how much space everything above the chart genuinely takes,
    // which can itself vary. This initial value is just enough for a
    // reasonable first paint; _fitMobileSheetChartHeight (above)
    // measures the real available space once the render has actually
    // happened and corrects it.
    if(fh) fh.style.height = '320px';
    const _fitFloor = () => {
      requestAnimationFrame(()=>requestAnimationFrame(()=>
        _fitMobileSheetChartHeight('floorTrendHost', 'ttab-floor', 240, 480)
      ));
    };
    // jv: "the graph floor trend tab doesn't seem to be displaying
    // properly. It's all grouped up unreadable." Confirmed directly:
    // unlike 'chart' and 'scatter' right next to this, this branch never
    // called Plotly.Plots.resize() after constraining the container's
    // height -- Plotly renders at whatever size the container had BEFORE
    // this height change, then the CSS squishes the already-laid-out SVG
    // into the smaller box without Plotly ever re-laying out its own axes/
    // labels to match, producing exactly this overlapping, unreadable
    // result.
    //
    // jv: that same explicit resize() 300ms later then turned out to be
    // exactly what caused "flashes on then vanishes" -- renderFloorTrend()
    // reads this container's own actual height directly into Plotly's
    // layout (see height:host.clientHeight inside renderFloorTrend
    // itself), so the very first render already agrees with whatever
    // height is set above it. _fitMobileSheetChartHeight only corrects
    // that afterward if the real, laid-out content above the chart
    // needs more or less room than this initial guess assumed --
    // chained directly off the render below, not an independent timer,
    // which is exactly what caused that earlier bug.
    if(!window._floorLoaded || !window._floorEvents?.length){
      loadFloorTrend(false).then(_fitFloor);
    } else {
      setTimeout(()=>{ renderFloorTrend(); _fitFloor(); }, 80);
    }
  }
  if(name === 'scatter'){
    const sh = document.getElementById('scatterHost');
    if(sh) sh.style.height = '240px';
    const hasL = window.LISTINGS && Object.keys(window.LISTINGS).length > 0;
    if(hasL) setTimeout(renderScatter, 50);
    setTimeout(()=>{ try{ Plotly.Plots.resize('scatterHost'); }catch(e){} }, 300);
  }
  if(name === 'salechart'){
    // jv: "I don't see the tab in the analytics panel" -- this mobile
    // bottom sheet has its own separate tab-button list and its own
    // per-tab load/resize triggers (both above this point in this same
    // function) entirely independent of switchTopTab()'s desktop-only
    // version; adding the desktop tab wasn't enough on its own.
    const sch = document.getElementById('saleChartHost');
    // jv: "so should the sales chart. It's a lot of vertical data with
    // the chart so should be more room to display it." then "The sales
    // chart is running off the bottom of the screen now" -- a fixed
    // pixel guess (400px) didn't account for how much space everything
    // above the chart (trait dropdown/wallet search/match mode/active
    // trait chips, a description that can wrap to two lines) genuinely
    // takes, which can itself vary. This initial value is just enough
    // for a reasonable first paint; _fitMobileSheetChartHeight (above)
    // measures the real available space once the render has actually
    // happened and corrects it, chained directly off the render below
    // rather than an independently-timed callback (the same class of
    // bug that caused Floor Trend's own "flashes on then vanishes"
    // regression previously).
    if(sch) sch.style.height = '320px';
    const _fitSaleChart = () => {
      requestAnimationFrame(()=>requestAnimationFrame(()=>
        _fitMobileSheetChartHeight('saleChartHost', 'ttab-salechart', 240, 480)
      ));
    };
    if(!window._floorLoaded || !window._floorEvents?.length){
      loadFloorTrend(false).then(()=>{
        if(document.getElementById('ttab-salechart')?.style.display !== 'none'){
          renderSaleChart();
          _fitSaleChart();
        }
      });
    } else {
      setTimeout(()=>{ renderSaleChart(); _fitSaleChart(); }, 80);
    }
  }
  if(name === 'holders' && !window._holdersLoaded) loadHolders(false);
  else if(name === 'holders' && window._holdersLoaded) renderHolders();
  if(name === 'wallet') requestWalletAnalyticsLoad(CONNECTED_WALLET?.address).catch(()=>{});
  if(name === 'burns' && typeof loadBurnsAnalytics === 'function') loadBurnsAnalytics(false).catch(()=>{});
  if(name === 'burned' && typeof renderBurnedTokensTab === 'function') renderBurnedTokensTab();
  if(name === 'pulse' && typeof loadTraitPulse === 'function') loadTraitPulse();
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
          for(const {token_id, price_eth, url, currency} of data.listings){
            window.LISTINGS[token_id] = { opensea: { price_eth, url, currency: currency || 'ETH', source: 'db' } };
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
  // jv: "the panel doesn't fully close now causing me not able to open it
  // back up." Root cause: openMobileAnalytics() sets an inline style.bottom
  // on the sheet (to clear the bottom nav bar while OPEN), but the CLOSED
  // state's CSS transform (translateY(100%)) moves the element down by its
  // OWN height, not the viewport's -- with a non-zero bottom offset still
  // in place, that leaves a residual strip exactly as tall as the offset
  // still sitting inside the viewport even after "closing" (confirmed
  // directly: sheet top landed at 799px in an 852px-tall viewport, a 53px
  // remnant matching the bar's height) -- which then covers the very
  // button needed to reopen it, the same click-blocking bug as before, just
  // reintroduced in a different spot. Resetting the offset back out on
  // close makes the standard bottom:0 + translateY(100%) fully clear the
  // viewport again, exactly as it did before that offset existed.
  const sheet = document.getElementById('mobileAnalyticsSheet');
  const overlay = document.getElementById('mobileAnalyticsOverlay');
  if(sheet) sheet.style.bottom = '';
  if(overlay) overlay.style.bottom = '';
  // Restore any moved panels back to #topTabPanel
  const tabPanel = document.getElementById('topTabPanel');
  const body = document.getElementById('analyticsSheetBody');
  if(tabPanel){
    ['chart','sales','burns','burned','mispriced','pulse','scatter','floor','salechart','holders','wallet'].forEach(name => { // 'salechart' was missing
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
  if(name === 'burned' && typeof renderBurnedTokensTab === 'function') renderBurnedTokensTab();
  if(name === 'pulse' && typeof loadTraitPulse === 'function') loadTraitPulse();
  if(name === 'scatter'){
    const hasListings = window.LISTINGS && Object.keys(window.LISTINGS).length > 0;
    if(hasListings) setTimeout(renderScatter, 100);
  }
  if(name === 'sales' && typeof fetchNewest === 'function' && !window.ALL_SALES?.length) fetchNewest(false);
}

// ── Mobile View Cycle ─────────────────────────────────────────────────────────
// Cycles through grid2 (2x2) -> standard (3x3) -> grid5 (5x5) -> compact
// (8x8) -> list -> back to grid2. Actual array/labels/icons defined below,
// after the comment explaining the row-height fix this cycle depends on.

// jv confirmed live: "the grid displays that actually change up are the
// 5x5 and the list view. The other grids don't even change." Root cause:
// VS.init() overwrites #tokenGrid's className entirely (not a toggle/merge
// -- a full replace), and decides which CSS class to keep based on its
// OWN this.mode string, checking specifically for the literal 'grid5' to
// preserve view-5x5 (see keepClasses just below in VS.init itself). Every
// UI call site below built that mode string with its own inline ternary,
// and every one of them collapsed both 'standard' and 'grid5' down to the
// same bare 'grid' -- so regardless of which of those two was actually
// clicked, VS.init() only ever re-applied view-2x2, silently discarding
// whatever applyViewMode() had just correctly toggled moments earlier.
// One shared mapping now, matching VS.init()'s own literal checks exactly
// (list/compact/grid5 pass through as-is, anything else -- 'standard' --
// becomes VS's internal 'grid'), used at every call site instead of each
// duplicating its own (buggy) version of this same logic.
function _vsModeFor(v){
  if(v === 'list' || v === 'compact' || v === 'grid5' || v === 'grid2' || v === 'grid1') return v;
  return 'grid';
}
// jv: "But I noticed you said 5 modes. On mobile I just want the 1x,
// 2x2, 3x3 and list view." Trimmed back down to exactly those four --
// grid5/compact stay desktop-only (still reachable there via the full
// icon row), and a new single-column grid1 mode covers "1x" (one
// full-width tile per row, distinct from list's compact data rows).
// Icons generated the same programmatic way as the rest of this set (a
// script laying out an NxN grid in one shared viewBox) so grid1's
// single tile matches the same visual style as the others.
const _mobileViews = ['grid1', 'grid2', 'standard', 'list'];
const _mobileViewLabels = { grid1: '1×', grid2: '2×2', standard: '3×3', list: 'List' };
const _mobileViewIcons = {
  grid1:    '<rect x="2.00" y="2.00" width="20.00" height="20.00" rx="3.60" fill="currentColor" stroke="none"/>',
  grid2:    '<rect x="2.00" y="2.00" width="8.77" height="8.77" rx="1.58" fill="currentColor" stroke="none"/><rect x="13.23" y="2.00" width="8.77" height="8.77" rx="1.58" fill="currentColor" stroke="none"/><rect x="2.00" y="13.23" width="8.77" height="8.77" rx="1.58" fill="currentColor" stroke="none"/><rect x="13.23" y="13.23" width="8.77" height="8.77" rx="1.58" fill="currentColor" stroke="none"/>',
  standard: '<rect x="2.00" y="2.00" width="5.62" height="5.62" rx="1.01" fill="currentColor" stroke="none"/><rect x="9.19" y="2.00" width="5.62" height="5.62" rx="1.01" fill="currentColor" stroke="none"/><rect x="16.38" y="2.00" width="5.62" height="5.62" rx="1.01" fill="currentColor" stroke="none"/><rect x="2.00" y="9.19" width="5.62" height="5.62" rx="1.01" fill="currentColor" stroke="none"/><rect x="9.19" y="9.19" width="5.62" height="5.62" rx="1.01" fill="currentColor" stroke="none"/><rect x="16.38" y="9.19" width="5.62" height="5.62" rx="1.01" fill="currentColor" stroke="none"/><rect x="2.00" y="16.38" width="5.62" height="5.62" rx="1.01" fill="currentColor" stroke="none"/><rect x="9.19" y="16.38" width="5.62" height="5.62" rx="1.01" fill="currentColor" stroke="none"/><rect x="16.38" y="16.38" width="5.62" height="5.62" rx="1.01" fill="currentColor" stroke="none"/>',
  list:     '<line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><rect x="3" y="4" width="4" height="4" rx="1"/><rect x="3" y="10" width="4" height="4" rx="1"/><rect x="3" y="16" width="4" height="4" rx="1"/>'
};

function mobileCycleView(){
  if(!window._tvIsPhone()) return;
  const cur = localStorage.getItem('viewMode') || 'standard';
  const idx = _mobileViews.indexOf(cur);
  const next = _mobileViews[(idx + 1) % _mobileViews.length];
  applyViewMode(next);
  localStorage.setItem('viewMode', next);
  localStorage.setItem('mobileViewMode', next); // separate from desktop prefs
  _updateMobileViewBtn(next);
  // Re-init virtual scroller with new mode
  if(VS.enabled && VS.ids.length){
    VS.init(VS.ids, _vsModeFor(next));
  }
  if(window._tvIsPhone()){
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
  if(!window._tvIsPhone()) return;
  const tg = document.getElementById('tokenGrid');
  if(!tg || !tg.classList.contains('list')) return;

  // Build last-sale lookup from floor events (if loaded) — O(n) once
  const lastSaleMap = new Map();
  if(window._floorEvents?.length){
    for(const ev of window._floorEvents){
      const eid = parseInt(ev.nft?.identifier || ev.token_id || 0);
      if(!eid || lastSaleMap.has(eid)) continue;
      const wei = ev.payment?.quantity;
      // jv: "the listings for nekoadz arent showing[,] 0 Eth and it
      // should be showing a price in USDG." Same root bug already
      // fixed for parseEthMaybeWei() (formatUtils.js) -- hardcoding
      // ETH's 18 decimals for any raw payment quantity, when OpenSea's
      // own event payload already carries the real decimals and symbol
      // for whatever currency was actually used (ev.payment.decimals/
      // .symbol). Using those directly instead of assuming 18 for
      // every currency.
      const decimals = ev.payment?.decimals;
      const symbol = ev.payment?.symbol;
      const eth = wei ? (Number(wei) / Math.pow(10, decimals != null ? decimals : 18)) : ev.price_eth;
      if(eth > 0) lastSaleMap.set(eid, { str: eth >= 1 ? eth.toFixed(3) : eth.toFixed(4), symbol: symbol || 'ETH' });
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
    // jv: "seems that whenever we fix the listing price display for
    // mobile it goes back to showing 0 eth on desktop and vice versa."
    // Another separate mobile-specific rendering path (this mobile
    // list-view datarow) with the same hardcoded "Ξ" bug, independent
    // of both stampMobilePrices() and the desktop list-view cell fixed
    // just above -- same fix pattern applied here too.
    const rowSym = (listing?.currency || 'ETH').toUpperCase();
    const priceDisplay = priceStr ? (['ETH','WETH'].includes(rowSym) ? 'Ξ '+priceStr : priceStr+' '+rowSym) : null;
    const lastSale = lastSaleMap.get(id) || null;
    const row = ROW_CACHE.get(id);

    const cells = [
      { label: 'Rank',
        value: rank ? '#' + rank.toLocaleString() : '—',
        cls: rank && rank <= 1000 ? 'purple' : rank && rank <= 3000 ? 'green' : '' },
      { label: 'Price',
        value: priceDisplay || 'Not listed',
        cls: priceDisplay ? 'green' : 'muted' },
      { label: 'Last Sale',
        value: lastSale ? (['ETH','WETH'].includes(lastSale.symbol) ? 'Ξ ' + lastSale.str : lastSale.str + ' ' + lastSale.symbol) : '—',
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
if(window._tvIsPhone()){
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
    const r = await fetch(`${LIVE_ENDPOINT}/nft/wallet?address=${encodeURIComponent(addr)}&contract=${encodeURIComponent(LIVE_CONTRACT)}&chain=${encodeURIComponent(LIVE_CHAIN)}`);
    const j = r.ok ? await r.json() : null;
    let ids = (j?.tokenIds || []).filter(id => id >= 1 && id <= 10000);
    ids = [...new Set(ids)];

    if(!ids.length){
      if(status) status.textContent = `No ${(typeof COLLECTIONS !== 'undefined' && COLLECTIONS[LIVE_SLUG]?.name) || 'tokens'} in this wallet right now.`;
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
    const lowestSym = lowestListed ? (window.LISTINGS[lowestListed].opensea.currency || 'ETH').toUpperCase() : 'ETH';

    if(status) status.textContent =
      `${ids.length} tokens${listed.length ? ` • ${listed.length} listed` : ''}` +
      (lowestPrice ? (['ETH','WETH'].includes(lowestSym) ? ` • Floor Ξ ${lowestPrice.toFixed(4)}` : ` • Floor ${lowestPrice.toFixed(4)} ${lowestSym}`) : '');

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
    // jv: "make the weth and eth wording through the page green for eth
    // and red for weth" -- this badge hardcoded #2dd4bf regardless of
    // currency; window.LISTINGS now carries the real currency (backend
    // fix alongside listStatsRowHtml/priceBadgeHtml's identical fixes).
    const isWethPrice = (window.LISTINGS?.[id]?.opensea?.currency||'ETH').toUpperCase() === 'WETH';
    const _pgs = priceGlyphAndSuffix(window.LISTINGS?.[id]?.opensea?.currency);
    const imgSrc = VS._imgSrc ? VS._imgSrc(id) : (typeof _getTokenImgSrc === 'function' ? _getTokenImgSrc(id) : null);
    const card = document.createElement('div');
    card.dataset.tokenId = id;
    // jv confirmed live: tokens in the Download Grid modal (3 columns,
    // narrower cells) were stacking/overlapping -- classic CSS grid item
    // default of min-width:auto (not 0), which lets a card's own content
    // (here, the image) refuse to shrink below some intrinsic size and
    // overflow its allocated grid track into neighboring cells. Same card
    // markup also renders into the original 2-column wallet-view grid,
    // where wider columns apparently gave enough slack that this never
    // surfaced there. min-width/min-height:0 lets the card actually
    // shrink to fit its track regardless of content size; explicit
    // width:100% keeps it filling that track either way.
    card.style.cssText = 'position:relative;border-radius:8px;overflow:hidden;cursor:pointer;background:color-mix(in srgb, var(--text) 4%, transparent);border:1px solid color-mix(in srgb, var(--text) 10%, transparent);aspect-ratio:1/1;min-width:0;min-height:0;width:100%';
    card.innerHTML =
      (imgSrc ? `<img src="${imgSrc}" loading="eager" decoding="async" fetchpriority="high" style="width:100%;height:100%;object-fit:contain;image-rendering:auto;display:block;backface-visibility:hidden;-webkit-backface-visibility:hidden">` : '') +
      `<div style="position:absolute;top:3px;left:3px;background:rgba(0,0,0,.82);font-size:8px;font-weight:700;padding:2px 4px;border-radius:3px">${displayRankHtml(id)}</div>` +
      `<div style="position:absolute;bottom:3px;left:3px;background:rgba(0,0,0,.82);color:#e6edf7;font-size:8px;font-weight:700;padding:2px 4px;border-radius:3px">#${id}</div>` +
      (priceStr ? `<div style="position:absolute;top:3px;right:3px;background:rgba(0,0,0,.82);color:${isWethPrice?'#f87171':'#2dd4bf'};font-size:8px;font-weight:700;padding:2px 4px;border-radius:3px">${_pgs.glyph}${priceStr}${_pgs.suffix}</div>` : '');
    card.addEventListener('click', () => {
      if(window._gridSelectMode){ toggleGridDownloadSelection(id, card); return; }
      closeMobileWalletDrawer(); openModal(id);
    });
    frag.appendChild(card);
  }
  grid.appendChild(frag);
}

function mobileWalletSort(mode){
  document.querySelectorAll('[data-mwsort]').forEach(b => b.classList.toggle('active', b.dataset.mwsort === mode));
  const grid = document.getElementById('mobileWalletGrid');
  if(!grid || !window._mobileWalletIds) return;
  let ids = [...(window._mobileWalletTagIds || window._mobileWalletIds)];
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
    const r = await fetch(`${LIVE_ENDPOINT}/nft/wallet?address=${encodeURIComponent(addr)}&contract=${encodeURIComponent(LIVE_CONTRACT)}&chain=${encodeURIComponent(LIVE_CHAIN)}`);
    const j = r.ok ? await r.json() : null;
    let ids = (j?.tokenIds || []).filter(id => id >= 1 && id <= 10000);
    ids = [...new Set(ids)];

    if(!ids.length){
      if(status) status.textContent = `No ${(typeof COLLECTIONS !== 'undefined' && COLLECTIONS[LIVE_SLUG]?.name) || 'tokens'} in this wallet right now.`;
      updateWalletIndicator(false);
      return;
    }

    ids.sort((a,b) => (RARITY_OBS_RANK.get(a)||99999) - (RARITY_OBS_RANK.get(b)||99999));

    const listed = ids.filter(id => window.LISTINGS?.[id]?.opensea?.price_eth != null);
    const lowestListed = listed.length ? listed.reduce((a,b) => {
      return (window.LISTINGS[a].opensea.price_eth < window.LISTINGS[b].opensea.price_eth) ? a : b;
    }) : null;
    const lowestPrice = lowestListed ? window.LISTINGS[lowestListed].opensea.price_eth : null;
    const lowestSym2 = lowestListed ? (window.LISTINGS[lowestListed].opensea.currency || 'ETH').toUpperCase() : 'ETH';

    if(status) status.textContent =
      `${ids.length} tokens${listed.length ? ` • ${listed.length} listed` : ''}` +
      (lowestPrice ? (['ETH','WETH'].includes(lowestSym2) ? ` • Floor Ξ ${lowestPrice.toFixed(4)}` : ` • Floor ${lowestPrice.toFixed(4)} ${lowestSym2}`) : '');

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
  _walletTagFilterSet('desktopWalletHolderTags', null, null);
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
    // jv: "make the weth and eth wording through the page green for eth
    // and red for weth" -- this badge hardcoded #2dd4bf regardless of
    // currency; window.LISTINGS now carries the real currency (backend
    // fix alongside listStatsRowHtml/priceBadgeHtml's identical fixes).
    const isWethPrice = (window.LISTINGS?.[id]?.opensea?.currency||'ETH').toUpperCase() === 'WETH';
    const _pgs = priceGlyphAndSuffix(window.LISTINGS?.[id]?.opensea?.currency);
    const imgSrc = VS._imgSrc ? VS._imgSrc(id) : (typeof _getTokenImgSrc === 'function' ? _getTokenImgSrc(id) : null);
    const card = document.createElement('div');
    card.dataset.tokenId = id;
    card.style.cssText = 'position:relative;border-radius:8px;overflow:hidden;cursor:pointer;background:color-mix(in srgb, var(--text) 4%, transparent);border:1px solid color-mix(in srgb, var(--text) 10%, transparent);aspect-ratio:1/1;min-width:0;min-height:0;width:100%';
    card.innerHTML =
      (imgSrc ? `<img src="${imgSrc}" loading="eager" decoding="async" fetchpriority="high" style="width:100%;height:100%;object-fit:contain;image-rendering:auto;display:block;backface-visibility:hidden;-webkit-backface-visibility:hidden">` : '') +
      `<div style="position:absolute;top:3px;left:3px;background:rgba(0,0,0,.82);font-size:8px;font-weight:700;padding:2px 4px;border-radius:3px">${displayRankHtml(id)}</div>` +
      `<div style="position:absolute;bottom:3px;left:3px;background:rgba(0,0,0,.82);color:#e6edf7;font-size:8px;font-weight:700;padding:2px 4px;border-radius:3px">#${id}</div>` +
      (priceStr ? `<div style="position:absolute;top:3px;right:3px;background:rgba(0,0,0,.82);color:${isWethPrice?'#f87171':'#2dd4bf'};font-size:8px;font-weight:700;padding:2px 4px;border-radius:3px">${_pgs.glyph}${priceStr}${_pgs.suffix}</div>` : '');
    card.addEventListener('click', () => {
      if(window._gridSelectMode){ toggleGridDownloadSelection(id, card); return; }
      openModal(id);
    });
    frag.appendChild(card);
  }
  grid.appendChild(frag);
}

function desktopWalletSort(mode){
  document.querySelectorAll('[data-dwsort]').forEach(b => b.classList.toggle('active', b.dataset.dwsort === mode));
  const grid = document.getElementById('desktopWalletGrid');
  const source = window._desktopWalletTagIds || window._desktopWalletIdsFiltered || window._desktopWalletIds;
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

  // Favorites-only pill — jv: reloaded the page after awhile, it came back
  // up in favorites-only mode (localStorage-persisted, see favorites.js's
  // FAVORITES_VIEW_KEY), and there was nothing on the actual grid/listings
  // screen itself indicating why -- the only existing indicator lives on
  // the toggle button itself (desktopFavoritesBtn/mobileFavoritesToggle),
  // tucked in a menu rather than in view. First pill shown, ahead of jump/
  // trait pills, since it's the one most likely to silently explain an
  // otherwise-empty-looking grid.
  if(typeof favoritesOnlyEnabled === 'function' && favoritesOnlyEnabled()){
    const pill = document.createElement('span');
    pill.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;background:rgba(255,215,106,.15);border:1px solid rgba(255,215,106,.4);color:var(--tc-ffd76a);font-size:12px;font-weight:600';
    const xBtn = document.createElement('span');
    xBtn.textContent = '×';
    xBtn.style.cssText = 'font-size:15px;line-height:1;opacity:.7;cursor:pointer';
    xBtn.addEventListener('click', e => {
      e.stopPropagation();
      if(typeof toggleFavoritesView === 'function') toggleFavoritesView();
      updateActivePills();
    });
    pill.appendChild(document.createTextNode('★ Favorites '));
    pill.appendChild(xBtn);
    container.appendChild(pill);
  }

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

  // Trait count pill -- jv confirmed live: this container (the pills shown
  // directly above the grid/listings, separate from the sidebar drawer's
  // own #activeChips which already got this fix) never considered
  // currentTraitCount at all, so a count-only filter showed no removable
  // pill here despite actively narrowing the listings underneath it.
  if(typeof currentTraitCount !== 'undefined' && currentTraitCount !== null){
    const pill = document.createElement('span');
    pill.style.cssText = 'display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;background:rgba(45,212,191,.15);border:1px solid rgba(45,212,191,.3);color:#2dd4bf;font-size:12px;font-weight:600';
    const xBtn = document.createElement('span');
    xBtn.textContent = '×';
    xBtn.style.cssText = 'font-size:15px;line-height:1;opacity:.7;cursor:pointer';
    xBtn.addEventListener('click', e => {
      e.stopPropagation();
      currentTraitCount = null;
      document.querySelectorAll('#traitChips .chip').forEach(n=>n.classList.remove('active'));
      if(typeof window.syncSalesFilterUI === 'function') window.syncSalesFilterUI();
      if(typeof updateChartAndList === 'function') updateChartAndList();
      updateActivePills();
    });
    pill.appendChild(document.createTextNode('Traits: ' + currentTraitCount + ' '));
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
  const isMobile = window._tvIsPhone();
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
  // jv: "there should be 1 more grid view. a 10x10, to show a little more
  // sales at once." 'grid10' = the same cards as 'grid', packed 10 across
  // (CSS .sales-grid10; 5 across on phones).
  const _g10 = document.getElementById('salesGrid');
  if(_g10) _g10.classList.toggle('sales-grid10', view === 'grid10');
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
  if(grid && window.SALES_VIEW === 'grid10') grid.classList.add('sales-grid10');
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
  // Scoped to this tab's own panel -- .mispriced-mode-btn is a shared,
  // generic pill-button style also reused by the Trait Pulse window
  // buttons (setPulseWindow below); an unscoped querySelectorAll here
  // would toggle 'active' off on those too whenever their own
  // data-window attribute doesn't happen to match this function's mode
  // argument.
  document.querySelectorAll('#ttab-mispriced .mispriced-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  // Re-run mispriced panel with new mode if listings are loaded
  if(window.LISTINGS && Object.keys(window.LISTINGS).length > 0){
    const ids = Object.keys(window.LISTINGS).map(Number).filter(id => {
      const l = window.LISTINGS[id];
      return l && l.opensea && l.opensea.price_eth != null;
    });
    if(typeof buildMispricedPanel === 'function') buildMispricedPanel(ids);
  }
}

// ── Trait Pulse ──────────────────────────────────────────────────────────────
// jv: "What traits are actually moving right now?" Reads the pre-computed
// rankings from /db/trait-pulse (lib/trait-pulse.js on the backend does the
// actual computation, on a schedule) -- this side only ever fetches and
// renders, never computes live.
window.PULSE_WINDOW = '1h';
function setPulseWindow(windowKey){
  window.PULSE_WINDOW = windowKey;
  document.querySelectorAll('#ttab-pulse .mispriced-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.window === windowKey));
  loadTraitPulse();
}

async function loadTraitPulse(){
  const grid = document.getElementById('pulseGrid');
  const computedAtEl = document.getElementById('pulseComputedAt');
  if(grid) grid.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:8px 0">Loading Trait Pulse…</div>';
  try{
    const data = await dbFetch('/db/trait-pulse', { window: window.PULSE_WINDOW, limit: '20' });
    if(!data.ok) throw new Error(data.error || 'Trait Pulse fetch failed');
    if(computedAtEl){
      computedAtEl.textContent = data.computed_at ? `Updated ${_pulseAgoLabel(data.computed_at)}` : '';
    }
    buildTraitPulsePanel(data.traits || []);
  }catch(e){
    console.warn('[TraitPulse] load failed:', e);
    if(grid) grid.innerHTML = `<div style="color:var(--tc-f87171);font-size:12px;padding:10px 0">Could not load Trait Pulse: ${e.message}</div>`;
  }
}

function _pulseAgoLabel(iso){
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.round(ms / 60000);
  if(mins < 1) return 'just now';
  if(mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

function buildTraitPulsePanel(traits){
  const grid = document.getElementById('pulseGrid');
  if(!grid) return;
  if(!traits.length){
    grid.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:10px 0">Nothing unusual right now -- no trait has enough recent activity in this window to confidently call it trending.</div>';
    return;
  }
  grid.innerHTML = traits.map((t, i) => {
    const heatX = t.velocity_multiplier.toFixed(1);
    const listingLine = t.listing_pressure_pct != null
      ? `Listed supply fell ${t.listed_count_prior} → ${t.listed_count}`
      : (t.listed_count != null ? `${t.listed_count} listed` : '');
    const pulseSym = window._liveCurrencySymbol || 'ETH';
    const floorLine = t.floor_change_pct != null
      ? `Trait floor ${['ETH','WETH'].includes(pulseSym) ? 'Ξ' : ''}${t.trait_floor_eth.toFixed(4)}${['ETH','WETH'].includes(pulseSym) ? '' : ' '+pulseSym} ${t.floor_change_pct >= 0 ? '↑' : '↓'}${Math.abs(t.floor_change_pct).toFixed(0)}%`
      : (t.trait_floor_eth != null ? `Trait floor ${['ETH','WETH'].includes(pulseSym) ? 'Ξ' : ''}${t.trait_floor_eth.toFixed(4)}${['ETH','WETH'].includes(pulseSym) ? '' : ' '+pulseSym}` : '');
    const velocityLine = `${t.sales_count} sold · ${t.supply} supply`;
    // data-* attributes read back via .dataset (not string-interpolated
    // into an inline onclick) -- a trait value containing an apostrophe
    // would otherwise break out of an inline onclick='...' string entirely.
    return `
      <div class="pulse-card" data-idx="${i}"
           style="padding:10px 12px;margin-bottom:8px;border-radius:10px;border:1px solid var(--border);background:color-mix(in srgb, var(--text) 3%, transparent);cursor:pointer">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
          <div style="font-weight:700;font-size:13px">${t.trait_name}: ${t.trait_value}</div>
          <div style="font-weight:700;font-size:13px;color:var(--tc-f87171);white-space:nowrap">🔥 ${heatX}×</div>
        </div>
        <div style="font-size:11px;color:var(--sub);margin-top:3px">${velocityLine}</div>
        ${floorLine ? `<div style="font-size:11px;color:var(--sub);margin-top:2px">${floorLine}</div>` : ''}
        ${listingLine ? `<div style="font-size:11px;color:var(--sub);margin-top:2px">${listingLine}</div>` : ''}
      </div>`;
  }).join('');
  // Attach click handlers after insertion, reading trait name/value from a
  // closed-over array index rather than round-tripping them through HTML
  // attributes at all.
  grid.querySelectorAll('.pulse-card').forEach(card => {
    const idx = parseInt(card.dataset.idx);
    const t = traits[idx];
    if(!t) return;
    card.addEventListener('click', () => applyTraitPulseFilter(t.trait_name, t.trait_value));
  });
}

// jv: "clicking Gold Fur immediately applies that trait filter to the
// existing TraitView grid" -- same activeTraits mechanism every other
// trait filter in this app already uses (the sidebar accordion's own
// checkbox handler is the reference for this exact pattern), replacing
// any existing filter on this trait NAME specifically (a user clicking a
// Pulse card is jumping straight to this one value, not adding it
// alongside whatever else may have been selected before).
async function applyTraitPulseFilter(traitName, traitValue){
  activeTraits.set(traitName, new Set([traitValue]));
  OPEN_GROUPS.add(traitName);
  await updateChartAndList();
  if(typeof renderActiveChips === 'function') renderActiveChips();
  if(typeof closeMobileAnalytics === 'function') closeMobileAnalytics();
}

// ── Mobile filter drawer ──────────────────────────────────────────────────────

// jv: "a memory so if you close or tap out of the trait panel when you
// open it back up it opens exactly where it was closed at." Module-level
// (not localStorage) since this only needs to survive within the current
// page session, not across a reload.
let _savedFilterDrawerScroll = 0;

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
    try{ leftCol.scrollTop = _savedFilterDrawerScroll; }catch{}
    // Render traits, with retry if TRAIT_DOMAIN not yet loaded
    function tryRenderTraits(attemptsLeft){
      if(typeof renderTraitAccordion !== 'function') return;
      const acc = document.getElementById('accTraits');
      if(!acc) return;
      if(Object.keys(TRAIT_DOMAIN||{}).length > 0){
        renderTraitAccordion(document.getElementById('traitSearch')?.value || '');
        // Re-apply after the accordion actually finishes rendering --
        // rendering it can itself change the drawer's total scrollable
        // height (e.g. if a category was left open from before), so the
        // assignment above (made before this render) might land at a
        // position that no longer means the same thing.
        try{ leftCol.scrollTop = _savedFilterDrawerScroll; }catch{}
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
  _savedFilterDrawerScroll = leftCol.scrollTop;
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
  if(!window._tvIsPhone()) return;
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
// ── Compare & Pinned slide-up sheet (mobile) ────────────────────────────
// jv: "there is no way to get down to the bottom of the page where the
// compare and pinned panels live unless you scroll the whole way" (the
// mobile grid is now as long as the whole collection). Chosen option:
// "Open Compare & Pinned in its own slide-up sheet." The sheet MOVES the
// live #comparePinnedWrap into itself while open and puts it back exactly
// where it was on close -- same DOM, so pin state, Swap/Clear/Export,
// renderPinned() and tap-to-open-modal all keep working with nothing
// duplicated. Opened from the hamburger menu (count shows what's pinned).
function _comparePinnedCount(){
  try{
    return (typeof pinnedSet !== 'undefined' ? pinnedSet.length : 0)
         + (typeof pinnedA !== 'undefined' && pinnedA ? 1 : 0)
         + (typeof pinnedB !== 'undefined' && pinnedB ? 1 : 0);
  }catch(e){ return 0; }
}
function _updateComparePinnedCount(){
  const el = document.getElementById('mobileComparePinnedCount');
  if(el){ const n = _comparePinnedCount(); el.textContent = n ? String(n) : ''; }
}
function openComparePinnedSheet(){
  document.getElementById('mobileMenu')?.classList.remove('open');
  const wrap = document.getElementById('comparePinnedWrap');
  if(!wrap) return;
  let ov = document.getElementById('cpSheetOverlay');
  let sh = document.getElementById('cpSheet');
  if(!sh){
    ov = document.createElement('div');
    ov.id = 'cpSheetOverlay';
    ov.addEventListener('click', closeComparePinnedSheet);
    sh = document.createElement('div');
    sh.id = 'cpSheet';
    sh.setAttribute('role', 'dialog');
    sh.setAttribute('aria-label', 'Compare and Pinned');
    sh.innerHTML = `
      <div class="cp-sheet-handle" aria-hidden="true"></div>
      <div class="cp-sheet-head">
        <span class="cp-sheet-title">Compare &amp; Pinned</span>
        <button type="button" class="cp-sheet-close" aria-label="Close" onclick="closeComparePinnedSheet()">✕</button>
      </div>
      <div class="cp-sheet-body" id="cpSheetBody"></div>`;
    // Drag the handle/header down to close (like the analytics sheet).
    let y0 = null, dy = 0;
    const head = () => sh.querySelector('.cp-sheet-head');
    const startDrag = e => { y0 = e.touches[0].clientY; dy = 0; sh.style.transition = 'none'; };
    const moveDrag = e => { if(y0 == null) return; dy = Math.max(0, e.touches[0].clientY - y0); sh.style.transform = `translateY(${dy}px)`; };
    const endDrag = () => { if(y0 == null) return; y0 = null; sh.style.transition = ''; sh.style.transform = '';
      if(dy > 90) closeComparePinnedSheet(); };
    sh.querySelector('.cp-sheet-handle').addEventListener('touchstart', startDrag, {passive:true});
    head().addEventListener('touchstart', startDrag, {passive:true});
    sh.addEventListener('touchmove', moveDrag, {passive:true});
    sh.addEventListener('touchend', endDrag, {passive:true});
    document.body.appendChild(ov);
    document.body.appendChild(sh);
  }
  const body = document.getElementById('cpSheetBody');
  if(wrap.parentNode !== body){
    sh._home = { parent: wrap.parentNode, next: wrap.nextSibling };
    body.appendChild(wrap);
  }
  // Show both panels expanded inside the sheet without touching the
  // saved collapsed/expanded preference for the page (cToggle's storage).
  ['panelCompare','panelPinned'].forEach(id => {
    const p = document.getElementById(id);
    if(p){ p._cpWasOpen = p.classList.contains('open'); p.classList.add('open'); }
  });
  requestAnimationFrame(() => { ov.classList.add('open'); sh.classList.add('open'); });
}
function closeComparePinnedSheet(){
  const ov = document.getElementById('cpSheetOverlay');
  const sh = document.getElementById('cpSheet');
  if(!sh || !sh.classList.contains('open')) return;
  ov?.classList.remove('open');
  sh.classList.remove('open');
  setTimeout(() => {
    const wrap = document.getElementById('comparePinnedWrap');
    if(wrap && sh._home && sh._home.parent){
      sh._home.parent.insertBefore(wrap, sh._home.next && sh._home.next.parentNode === sh._home.parent ? sh._home.next : null);
    }
    ['panelCompare','panelPinned'].forEach(id => {
      const p = document.getElementById(id);
      if(p && p._cpWasOpen === false) p.classList.remove('open');
    });
    _updateComparePinnedCount();
  }, 260);
}
document.addEventListener('keydown', e => { if(e.key === 'Escape') closeComparePinnedSheet(); });

// ── Install app (PWA) ──────────────────────────────────────────────────
// jv: "I think I want to build out an app for traitview" -> installable web
// app first. Android / desktop Chrome fire beforeinstallprompt -> show the
// real install dialog. iPhone browsers have no install API -> short
// Share -> Add to Home Screen guide. Hidden when already running as the app.
let _tvInstallPrompt = null;
function _tvIsInstalled(){
  return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
}
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); _tvInstallPrompt = e; });
window.addEventListener('appinstalled', () => { _tvInstallPrompt = null; const b = document.getElementById('mobileInstallAppBtn'); if(b) b.style.display = 'none'; });
function _tvSyncInstallBtn(){
  const b = document.getElementById('mobileInstallAppBtn');
  if(b) b.style.display = _tvIsInstalled() ? 'none' : '';
}
async function tvInstallApp(){
  document.getElementById('mobileMenu')?.classList.remove('open');
  if(_tvInstallPrompt){
    _tvInstallPrompt.prompt();
    try{ await _tvInstallPrompt.userChoice; }catch(_){}
    _tvInstallPrompt = null;
    return;
  }
  // iPhone / browsers without an install prompt: short guide.
  let ov = document.getElementById('tvInstallGuide');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'tvInstallGuide';
    ov.innerHTML = `<div class="tvig-card" role="dialog" aria-label="Install TraitView">
        <img src="/images/icons/icon-192.png" width="56" height="56" alt="" style="border-radius:13px">
        <div class="tvig-title">Install TraitView</div>
        <ol class="tvig-steps">
          <li>Tap the <b>Share</b> button <span class="tvig-share">⬆︎</span> in your browser</li>
          <li>Choose <b>Add to Home Screen</b></li>
          <li>Tap <b>Add</b> — TraitView opens full-screen from its icon</li>
        </ol>
        <button type="button" class="tvig-close" onclick="document.getElementById('tvInstallGuide').remove()">Got it</button>
      </div>`;
    ov.addEventListener('click', e => { if(e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  }
}

function toggleMobileMenu(){
  closeMobileFilter();
  const menu = document.getElementById('mobileMenu');
  const opening = menu && !menu.classList.contains('open');
  menu?.classList.toggle('open');
  if(opening){ _updateComparePinnedCount(); _tvSyncInstallBtn(); }
  if(opening){
    // jv: menu's own bottom content was hiding behind the fixed bottom nav
    // bar. The CSS max-height only ever accounted for a flat, guessed 24px
    // gap at the bottom -- #mobileBottomBar (icon + its own padding + the
    // device's safe-area-inset-bottom) actually runs closer to 55-70px
    // depending on the device, so that guess was never enough room.
    // Measuring the bar's real, rendered height here instead of guessing a
    // fixed number keeps this correct across every device's actual
    // safe-area inset, not just the one this was eyeballed against.
    const bar = document.getElementById('mobileBottomBar');
    const barHeight = bar ? bar.getBoundingClientRect().height : 60;
    menu.style.setProperty('--mobile-bottom-bar-height', `${barHeight}px`);
  }
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

// ── Minimal theme (separate control, per jv's request) ──────────────────────
// Deliberately its own independent on/off/light/dark state rather than a
// fifth stop on the existing neon theme cycle -- jv specifically asked for
// a separate control. Stored under its own localStorage key so it doesn't
// interfere with the existing 'theme' key at all; when minimal is "off",
// this restores whatever neon theme was already saved there, rather than
// this feature needing to know or care what that value is.
function _applyMinimalTheme(mode){
  const normalized = ['off','light','dark'].includes(mode) ? mode : 'off';
  localStorage.setItem('minimalTheme', normalized);
  if(normalized === 'off'){
    const savedNeon = (localStorage.getItem('theme') || 'slate').toLowerCase();
    document.documentElement.setAttribute('data-theme', ['slate','midnight','cyber','ink'].includes(savedNeon) ? savedNeon : 'slate');
  } else {
    document.documentElement.setAttribute('data-theme', normalized === 'light' ? 'minimal-light' : 'minimal-dark');
  }
  const labelText = normalized === 'off' ? 'Off' : (normalized === 'light' ? 'Light' : 'Dark');
  const mobileLabel = document.getElementById('minimalThemeLabel');
  const desktopLabel = document.getElementById('desktopMinimalThemeLabel');
  if(mobileLabel) mobileLabel.textContent = labelText;
  if(desktopLabel) desktopLabel.textContent = labelText;
}
function cycleMinimalTheme(evt){
  if(evt){ evt.preventDefault(); evt.stopPropagation(); }
  const order = ['off','light','dark'];
  const current = (localStorage.getItem('minimalTheme') || 'dark').toLowerCase();
  const idx = order.indexOf(current);
  const next = order[((idx >= 0 ? idx : 0) + 1) % order.length];
  _applyMinimalTheme(next);
}
// Applied once at page load (see init() call below) so a saved minimal
// theme choice actually persists across a reload, same as the neon theme
// already does via applyThemeMobile() -- without this, minimal mode would
// silently reset to "off" every time the page refreshed.
//
// jv: "make the minimal dark theme the default... if a user had
// previously selected a theme, if they choose a theme it remembers and
// always loads with it." The persistence already worked correctly (an
// explicit prior choice, including explicitly choosing 'off' to go back
// to a neon theme, is always respected here since localStorage.getItem
// only returns null when nothing was ever set) -- the only thing
// missing was what a first-time visitor with nothing saved yet should
// see. Changed the fallback from 'off' to 'dark' for exactly that case.
function restoreMinimalThemeOnLoad(){
  const saved = (localStorage.getItem('minimalTheme') || 'dark').toLowerCase();
  if(saved !== 'off') _applyMinimalTheme(saved);
  else {
    // Still update the label even when off, so it doesn't show blank/wrong
    // before the user ever interacts with the button this session.
    const mobileLabel = document.getElementById('minimalThemeLabel');
    const desktopLabel = document.getElementById('desktopMinimalThemeLabel');
    if(mobileLabel) mobileLabel.textContent = 'Off';
    if(desktopLabel) desktopLabel.textContent = 'Off';
  }
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
  if(!window._tvIsPhone()) return;
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
      // jv: "seems that whenever we fix the listing price display for
      // mobile it goes back to showing 0 eth on desktop and vice
      // versa." Traced this fully: it was never actually reverting --
      // this mobile-only stamping function (a completely separate code
      // path from however the desktop card template renders its own
      // price) was hardcoding "Ξ " regardless of currency the whole
      // time, so any fix made elsewhere (desktop's own template, the
      // Mispriced panel, the floor pill) never touched this specific
      // spot at all. Same currency-aware pattern as those other fixes.
      const sym = (listing.currency || 'ETH').toUpperCase();
      priceEl.textContent = ['ETH','WETH'].includes(sym) ? ('Ξ ' + eth) : (eth + ' ' + sym);
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
    if(window._tvIsPhone()){
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
    // jv confirmed live: "standard and compact don't change at all" (and
    // separately, bunched/overlapping thumbnails once rowH was fixed) --
    // grid5 already had its own explicit case here for exactly this reason
    // ("the width-based formula below would never reliably produce
    // exactly 5"), but the identical fix was never applied to 'standard'
    // or 'compact', even though both are equally fixed, non-width-
    // responsive CSS grids (view-2x2 is repeat(2,...), compact is
    // repeat(8,...) -- see css/styles.css). Both used to fall through to
    // the width-based formula below, which can produce any column count
    // depending on the container's actual width that day -- almost never
    // the 2 or 8 the CSS itself is actually locked to. _paint()'s row math
    // (i0 = firstRow * this.cols) then assumed a completely different
    // column count than what the grid was actually laid out with,
    // guaranteeing a mismatch between which ids virtualization thinks
    // belong in which row and where the CSS grid actually places them.
    if(this.mode === 'grid5') return 5;
    // jv: "maybe a 3x3 would be good so it can fill out the panel
    // width. but the grid buttons don't match the actually grid
    // patterns. 2x2 grid button should be the 3x3, the 5x5 grid should
    // be the 5x5, and so on." Both the icon (index.html) and the
    // column count itself now match "3x3" -- and the "5x5"/"8x8"
    // buttons, confirmed genuinely mismatched (the 5x5 button's icon
    // was actually a 3x3 pattern; the 8x8 button's was actually 4x4),
    // now have icons that actually contain that many squares.
    if(this.mode === 'grid') return 3;
    // jv: "Somewhere along the line you added the 3x3 grid on mobile.
    // Which I really look but can I get the 2x2 grid back as well?"
    // liked the 3x3 (kept as 'grid' above), but wants the true 2x2 back
    // too as its own separate mode, not replaced by 3x3 -- a fifth
    // button/mode alongside grid/grid5/compact/list.
    if(this.mode === 'grid2') return 2;
    // jv: "On mobile I just want the 1x, 2x2, 3x3 and list view." New
    // single-column grid mode -- one full-width tile per row, distinct
    // from 'list' (which shows compact data rows, not a big image tile).
    if(this.mode === 'grid1') return 1;
    if(this.mode === 'compact') return 8;
    if(window._tvIsPhone()) return 2;
    const minW = 220;
    const gap = 8;
    const fallback = Math.max(1, Math.floor((w + gap) / (minW + gap)));
    // jv confirmed live (fourth report of "switching grids doesn't
    // work"): if this ever logs, this.mode is something other than the
    // known values (grid5/grid/grid2/compact/list) at the moment
    // _computeCols runs -- meaning whatever set this.mode passed through
    // something other than _vsModeFor, or _vsModeFor itself isn't being
    // reached. Worth knowing either way rather than silently falling
    // through to a width-based guess for an unrecognized mode.
    console.log(`[VS._computeCols] FELL THROUGH to width-based formula -- this.mode="${this.mode}" (expected grid5/grid/grid2/compact) fallback=${fallback}`);
    return fallback;
  },

  async init(ids, mode){
    this.enabled = true;
    this.ids = ids.slice();
    this.mode = mode || 'grid';
    this.visStart = -1; this.visEnd = -1;
    this.bufferRows = window._tvIsPhone() ? 6 : 3;

    const tg = document.getElementById('tokenGrid');
    if(!tg) return false;

    const keepClasses = [];
    if(this.mode === 'list') keepClasses.push('list');
    if(this.mode === 'compact') keepClasses.push('compact');
    // Confirmed live: .view-5x5 and .view-2x2 are both real CSS classes
    // applyViewMode() toggles onto #tokenGrid for the 5x5-grid and
    // standard-grid view modes respectively (hiding pinbar/tmeta, sizing
    // the thumbnail to fill the tile) -- neither was ever preserved here,
    // so activating this mode would have silently dropped that styling.
    if(this.mode === 'grid5') keepClasses.push('view-5x5');
    if(this.mode === 'grid') keepClasses.push('view-2x2');
    tg.className = ['vs-active', ...keepClasses].join(' ');
    this.cols = this._computeCols(tg);

    // jv confirmed live: scrolling down on desktop would "rocket" straight
    // to the bottom of the grid instead of scrolling normally. Root-caused
    // with a scrollTop instrumentation harness: the browser's default CSS
    // scroll anchoring was compensating for _paint()'s own DOM replacements
    // (replaceChildren() on _vsRows, plus _vsTop/_vsBot height changes) by
    // silently adjusting scrollTop to "preserve" the visual position of
    // whatever it picked as the anchor node -- but VS already manages
    // scroll position itself via the _vsTop/_vsBot spacer math, so the
    // browser's own correction fights it and compounds: each _paint() call
    // shifts content, the anchor correction nudges scrollTop further, which
    // triggers another _paint() via the scroll listener, which shifts
    // content again. A handful of scroll ticks was enough for it to snowball
    // all the way to the end of the list. overflow-anchor:none turns this
    // browser behavior off for this container specifically, which a direct
    // (non-wheel) scrollTop-increment test confirmed fixes it completely --
    // verified on both this desktop branch and the mobile one below, since
    // both share the exact same _paint()/replaceChildren() pattern.
    if(window._tvIsPhone()){
      // jv: "Only 12 rows in the 3x3 grid loaded. Nothing under that."
      // (after the single-scroller change) -- this inline !important
      // style still made the grid its own fixed-height scroller
      // (height calc(100dvh - 106px), overflow-y auto), and inline
      // !important beats any stylesheet rule, so the CSS side of that
      // change never took effect: the page scrolled the header away,
      // then stopped, with the grid's rows trapped in its own box.
      // Mobile grid is now full height with no scroller of its own; the
      // page scrolls it (see the scroll listener + _paint below).
      // overflow-anchor:none kept: it excludes the grid's tiles from the
      // browser's scroll anchoring whichever element scrolls, which is
      // what prevents the "snowball to the end of the list" described
      // above.
      tg.style.cssText = 'display:block!important;overflow:visible!important;box-sizing:border-box!important;width:100%!important;height:auto!important;max-height:none!important;padding:0!important;overflow-anchor:none!important;';
    }else{
      // jv: "When scrolling up or down the main token panels grid and
      // you get to the top of the listings and top of the scroll bar
      // it should then scroll the entire page up and vice versa when
      // scrolling down." overscroll-behavior:none explicitly blocked
      // scroll chaining -- once the grid's own internal scroll hit its
      // top or bottom, the browser had nowhere else to send the
      // remaining scroll input, so it just stopped there instead of
      // handing it off to the page. auto (the browser's own default)
      // lets that handoff happen naturally in both directions.
      tg.style.cssText = 'display:block!important;overflow-y:auto!important;overflow-x:hidden!important;box-sizing:border-box!important;width:100%!important;max-height:520px!important;padding-right:4px!important;overscroll-behavior:auto!important;scroll-behavior:auto!important;overflow-anchor:none!important;';
    }
    tg.innerHTML = '';

    if(!ids.length){
      tg.innerHTML = '<div style="color:var(--sub);padding:20px;text-align:center;font-size:14px">No matches.</div>';
      return true;
    }

    const vw = tg.clientWidth || window.innerWidth;
    // jv confirmed live: "list view isn't correct... small bunched
    // thumbnails" and only 5x5/list actually display right. Root cause:
    // this used a single hardcoded rowH (122 desktop, vw/2+6 mobile) for
    // BOTH grid and grid5 -- treating a 2-column layout and a 5-column
    // layout as if their cards were the same height. They're not: every
    // card here is aspect-ratio:1/1, so a card's actual rendered height
    // equals its column width (vw/cols), and 2 columns vs 5 columns means
    // very different actual heights. The virtualizer's own spacer math
    // (_vsTop/_vsBot heights, firstRow/lastRow in _paint()) entirely
    // trusts this.rowH to know how tall a row of DOM content really is --
    // whichever mode didn't match the hardcoded assumption got rows
    // overlapping their neighbors, which reads exactly as "bunched."
    // 'compact' already correctly derived this from vw/this.cols; grid
    // and grid5 both get the identical per-column-width treatment now,
    // since applyViewMode() already hides the same pinbar/tmeta elements
    // for all three modes -- they share the same "image fills the tile,
    // nothing else" layout, just at different column counts.
    //
    // jv: "the 2x2 grid images still too big. Shrink them smaller...
    // should stay 2x2." Every earlier attempt at this was CSS trying to
    // override a column width that was never set by CSS in the first
    // place -- grid-template-columns for this container is built as an
    // inline style string right here in JS (a few lines down), from
    // this.cols, and a repeat(2, minmax(0,1fr)) column always stretches
    // to fill half the container no matter what CSS says about it
    // afterward. The actual fix has to happen at the value that gets
    // built into that string: capping each column's own width instead
    // of letting it fill vw/cols, for 'grid' mode on desktop
    // specifically. rowH has to use this exact same capped width, not
    // the full vw/cols, since this is literally the virtualizer's own
    // row-height math (the comment above) -- if this didn't match the
    // grid's real column width, scrolling would desync into gaps or
    // overlaps exactly the way it did before that fix landed.
    // jv: "maybe a 3x3 would be good so it can fill out the panel
    // width." this.cols is now 3 for 'grid' mode -- fixing the hardcoded
    // "/ 2" here too, since it needs to divide by however many columns
    // this.cols actually is, not always 2. Accounts for (this.cols - 1)
    // gaps between columns, not just one, since a 3-column row has two
    // gaps, not one.
    const gapForGridMode = window._tvIsPhone() ? 6 : 8;
    // jv: "On mobile I just want the 1x, 2x2, 3x3 and list view." grid2
    // (true 2-column) is reachable on desktop too via the full icon row,
    // and would hit the exact same "images too big" issue the original
    // 3-column fix was for if left uncapped -- same cap applies to both.
    const isDesktopGridMode = (this.mode === 'grid' || this.mode === 'grid2') && !window._tvIsPhone();
    const gridColWidth = isDesktopGridMode ? Math.min(400, Math.round((vw - (this.cols - 1) * gapForGridMode) / this.cols)) : null;

    if(this.mode === 'list') this.rowH = window._tvIsPhone() ? 88 : 112;
    else if(isDesktopGridMode) this.rowH = gridColWidth + 8;
    else this.rowH = Math.round(vw / this.cols) + (window._tvIsPhone() ? 6 : 8);

    tg._vsTop  = document.createElement('div');
    tg._vsRows = document.createElement('div');
    tg._vsBot  = document.createElement('div');

    tg._vsTop.style.cssText  = 'height:0;width:100%;flex-shrink:0';
    tg._vsBot.style.cssText  = 'height:0;width:100%;flex-shrink:0';
    const gap = window._tvIsPhone() ? 6 : 8;
    // jv: "dead space on the sides... push the grid images a little
    // bigger" -- this container's own padding (previously reusing the
    // same value as the gap BETWEEN tiles) compounds with .c-body-inner's
    // padding above it, adding up to real, visible dead space at the
    // grid's outer edges specifically. Kept the gap between individual
    // tiles the same (still needed for visual separation) but the
    // padding around the whole grid drops to near-zero for minimal,
    // freeing up real width for every tile to grow into.
    const isMinimalTheme = (document.documentElement.getAttribute('data-theme') || '').startsWith('minimal-');
    const outerPad = isMinimalTheme ? 0 : gap;
    tg._vsRows.style.cssText = this.mode === 'list'
      ? `display:flex;flex-direction:column;gap:${gap}px;width:100%;padding:${outerPad}px;box-sizing:border-box`
      : isDesktopGridMode
        ? `display:grid;grid-template-columns:repeat(${this.cols}, ${gridColWidth}px);justify-content:center;gap:${gap}px;width:100%;max-width:100%;min-width:0;padding:${outerPad}px;box-sizing:border-box;overflow-x:hidden`
        : `display:grid;grid-template-columns:repeat(${this.cols}, minmax(0, 1fr));gap:${gap}px;width:100%;max-width:100%;min-width:0;padding:${outerPad}px;box-sizing:border-box;overflow-x:hidden`;

    tg.appendChild(tg._vsTop);
    tg.appendChild(tg._vsRows);
    tg.appendChild(tg._vsBot);

    // jv: "It's like 1 spot right at top. Even when I scroll back up it
    // stops there at that same spot until I scroll up again." On mobile
    // the grid was its OWN scroll area (fixed to the viewport height)
    // inside a page that also scrolls: the page scrolled the header away,
    // then the swipe had to hand off to the grid's scroller -- and iOS
    // never carries momentum from one scroller to the next, so every swipe
    // died at that boundary, in both directions. Mobile now uses ONE
    // scroller: the grid grows to its full virtual height (styles.css) and
    // the page scrolls everything; virtualization tracks the page scroll.
    // Desktop keeps its inner scroller unchanged.
    const frame = () => {
      if(!this._raf) this._raf = requestAnimationFrame(()=>{ this._raf=null; this._paint(); });
    };
    tg.onscroll = frame;
    if(tg._vsWinListener){
      document.removeEventListener('scroll', tg._vsWinListener, true);
      window.removeEventListener('resize', tg._vsWinListener);
    }
    // jv: "The fix you did for the scroll messed up the images loading on
    // the grid. Only 12 rows loaded. Nothing under that." This listened on
    // WINDOW -- but html,body{height:100%;overflow-x:hidden} makes BODY the
    // actual scrolling element on mobile, and an element's scroll events
    // never reach window. So the grid painted its first screen + buffer
    // and never heard another scroll. A capture-phase listener on document
    // hears scroll events from WHATEVER element is scrolling (body,
    // window, or a wrapper); _paint's position math already measures the
    // grid's on-screen offset, which is right no matter what scrolls.
    tg._vsWinListener = () => { if(window._tvIsPhone()) frame(); };
    document.addEventListener('scroll', tg._vsWinListener, { capture:true, passive:true });
    window.addEventListener('resize', tg._vsWinListener, { passive:true });
    if(window._tvIsPhone()){
      // New result set: if we're already scrolled down into the grid,
      // bring its start back into view (the page equivalent of the
      // scrollTop = 0 reset below); if the grid's start is already on
      // screen, don't move the page at all.
      const r = tg.getBoundingClientRect();
      if(r.top < 0){ const sc = _vsPageScroller(tg); sc.scrollTop = sc.scrollTop + r.top; }
    }
    tg.scrollTop = 0;
    this._paint();

    requestAnimationFrame(()=> requestAnimationFrame(()=>{
      // jv confirmed live: standard/compact grid modes only ever loaded
      // the tokens visible in the very first paint -- nothing new loaded
      // on scroll, while list and grid5 both worked correctly. The one
      // real difference: grid5's column count is a hardcoded constant
      // (_computeCols returns 5 unconditionally), while standard/compact
      // both depend on tg.clientWidth at the exact moment init() ran.
      // Unlike rowH directly below (which already had this same kind of
      // self-correction), this.cols was never re-validated afterward --
      // if clientWidth was 0/stale at that instant (plausible right after
      // a collection switch, before the container's own layout settles),
      // the virtualization math below (i0 = firstRow * this.cols) would
      // stay wrong for the rest of the session, silently starving every
      // row past the first of any tokens at all. Re-measuring the actual
      // rendered column count directly from the DOM (the true source of
      // truth) rather than re-deriving it from clientWidth a second time,
      // since a second clientWidth read could suffer the exact same
      // timing problem as the first.
      if(this.mode !== 'list'){
        const rowsEl = tg._vsRows;
        if(rowsEl && rowsEl.children.length > 1){
          const firstTop = rowsEl.children[0].offsetTop;
          let measuredCols = 1;
          for(let i = 1; i < rowsEl.children.length; i++){
            if(rowsEl.children[i].offsetTop !== firstTop){ measuredCols = i; break; }
            measuredCols = i + 1;
          }
          // jv confirmed live (fourth report of "switching grids doesn't
          // work"): logging this specifically since it's the one place
          // that can silently override an already-correct this.cols
          // (set moments earlier by _computeCols) with a wrong one -- if
          // rowsEl has fewer children than the real column count at the
          // instant this runs, every rendered child still shares the
          // first row's offsetTop, so this loop never finds a "next row"
          // and measuredCols ends up as rowsEl.children.length itself,
          // not the actual column count.
          console.log(`[VS.measureCols] mode=${this.mode} computedCols=${this.cols} rowsEl.children.length=${rowsEl.children.length} measuredCols=${measuredCols}`);
          if(measuredCols > 0 && measuredCols !== this.cols){
            console.log(`[VS.measureCols] OVERRIDING this.cols ${this.cols} -> ${measuredCols}`);
            this.cols = measuredCols;
            this.visStart = -1; this.visEnd = -1;
            this._paint();
          }
        }
      }
      const first = tg._vsRows.firstElementChild;
      if(first){
        const gapPx = window._tvIsPhone() ? 6 : 8;
        const h = first.getBoundingClientRect().height;
        if(h > 10 && Math.abs(h + gapPx - this.rowH) > 10){
          this.rowH = h + gapPx;
          this.visStart = -1; this.visEnd = -1;
          this.bufferRows = window._tvIsPhone() ? 6 : 3;
          this._paint();
        }
      }
    }));
    return true;
  },

  async _paint(){
    const tg = document.getElementById('tokenGrid');
    if(!tg || !tg._vsRows || !this.enabled || !this.ids.length) return;

    // Mobile (<=900px): the PAGE scrolls the grid (see the window-scroll
    // note in init below), so "how far into the grid are we" is how far
    // the grid's top edge has moved above the viewport.
    const winMode = window._tvIsPhone();
    const scrollTop = winMode ? Math.max(0, -tg.getBoundingClientRect().top) : tg.scrollTop;
    const viewH = winMode ? window.innerHeight : (tg.clientHeight || (window.innerHeight - 106));
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
        else if(window._tvIsPhone()) card = this._gridCard(id);
        else card = await this._standardCard(id);
        // Confirmed live via jv's exact repro sequence: toggling the SAME
        // control (Live Listings) on/off/on reproduced the SAME broken/
        // working pattern every single time within one collection session
        // -- ruling out cross-collection cache poisoning (already fixed
        // separately) and pointing here instead. Both _gridCard and
        // _standardCard/gridThumbHtml omit the <img> tag entirely and fall
        // back to a plain background div whenever the image genuinely
        // wasn't ready yet at build time (e.g. a chunk not fully populated
        // in this exact instant). Caching that placeholder unconditionally
        // meant it was reused by id FOREVER after -- toggling back to the
        // exact same unfiltered, price-sorted view kept re-serving that
        // same cached, permanently-blank node, while a trait filter
        // surfaced a different, never-before-cached set of ids that built
        // correctly on their first (only) attempt. Only cache a card once
        // it actually has a real <img> in it, so a momentarily-missing
        // image gets a genuine retry the next time this id comes up,
        // instead of being locked into failure the first time it happened.
        if(card && !card.querySelector('img')) return card;
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
    if(!window._tvIsPhone()){
      attachPreviewHandlers();
      syncFavoriteButtons();
      // Confirmed live: applyViewMode() applies the SAME inline style
      // overrides (hiding pinbar/tmeta, resizing the thumbnail to fill the
      // tile) identically for compact, standard (grid), AND grid5 -- only
      // the CSS class differs between them (handled separately in
      // VS.init()'s keepClasses above). Previously only ever called for
      // 'compact' specifically, meaning cards rendered here for grid5 or
      // the default standard mode would have been missing those overrides
      // entirely.
      const _viewModeMap = { compact: 'compact', grid5: 'grid5', grid: 'standard' };
      const _vm = _viewModeMap[this.mode];
      if(_vm && typeof applyViewMode === 'function') applyViewMode(_vm);
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
    // jv: "make the weth and eth wording through the page green for eth
    // and red for weth" -- this badge hardcoded #2dd4bf regardless of
    // currency; window.LISTINGS now carries the real currency (backend
    // fix alongside listStatsRowHtml/priceBadgeHtml's identical fixes).
    const isWethPrice = (window.LISTINGS?.[id]?.opensea?.currency||'ETH').toUpperCase() === 'WETH';
    const _pgs = priceGlyphAndSuffix(window.LISTINGS?.[id]?.opensea?.currency);
    const imgSrc = this._imgSrc(id);
    const isMinimal = (document.documentElement.getAttribute('data-theme') || '').startsWith('minimal-');
    const d = document.createElement('div');
    d.dataset.id = id;
    if(isMinimal){
      // Confirmed live with jv: the previous overlay-badges-on-every-corner
      // treatment was exactly the "competing with the art" look he wanted
      // OUT of this theme specifically -- this is a genuinely different
      // structure for minimal, not just a recolor of the same one. A single
      // small, quiet id label sits on the image itself (always visible);
      // rank+price only appear as a soft overlay on hover, since hover has
      // no meaning on mobile touch and no gesture here already means
      // "reveal detail" without colliding with tap-to-open-modal; and the
      // same rank+price info is repeated below the image at all times,
      // which is what actually serves mobile (and is also just there for
      // anyone on desktop who isn't actively hovering this exact tile).
      // jv: "the token # is displayed twice and the full listing price
      // is not visible. Can we remove the token # from under the image
      // and move the overlay to the top left so it's not covering the
      // image?" minimal-tile-id (on the image) and this meta line's own
      // "#id" span were both showing the id at once; dropping the
      // duplicate here also frees up width in this line for the price
      // to actually fit instead of getting cut off. minimal-tile-hover
      // moved to a small top-left badge in the CSS below (was inset:0,
      // covering the whole image) rather than removed outright, since
      // it's still useful info -- just not full-image-covering info.
      d.style.cssText = 'display:flex;flex-direction:column;min-width:0;width:100%;max-width:100%;cursor:pointer;box-sizing:border-box';
      const hoverDetail = (rank || priceStr) ? `<div class="minimal-tile-hover">${rank ? `<span>${rankDiamondHtml(rank,'',rankSys)}</span>` : ''}${priceStr ? `<span style="color:${isWethPrice?'#f87171':'#2dd4bf'}">${_pgs.glyph}${priceStr}${_pgs.suffix}</span>` : ''}</div>` : '';
      d.innerHTML =
        `<div class="minimal-tile-image" style="position:relative;aspect-ratio:1/1;overflow:hidden;background:var(--muted)">` +
          (imgSrc ? `<img src="${imgSrc}" loading="eager" decoding="async" fetchpriority="high" style="width:100%;height:100%;object-fit:contain;image-rendering:auto;display:block">` : '') +
          `<div class="minimal-tile-id">#${id}</div>` +
          hoverDetail +
        `</div>` +
        `<div class="minimal-tile-meta">` +
          (rank ? `<span>${rankDiamondHtml(rank,'',rankSys)}</span>` : '') +
          (priceStr ? `<span class="minimal-tile-price" style="color:${isWethPrice?'#f87171':'#2dd4bf'}!important">${_pgs.glyph}${priceStr}${_pgs.suffix}</span>` : '') +
        `</div>`;
      if(connectedWalletOwns(id)) d.insertAdjacentHTML('beforeend', '<span class="vs-owned-badge">Owned</span>');
      d.addEventListener('click', () => openModal(id));
      return d;
    }
    d.style.cssText = 'position:relative;min-width:0;width:100%;max-width:100%;border-radius:10px;overflow:hidden;cursor:pointer;background:color-mix(in srgb, var(--text) 4%, transparent);border:1px solid color-mix(in srgb, var(--text) 10%, transparent);aspect-ratio:1/1;contain:layout paint style;box-sizing:border-box';
    if(connectedWalletOwns(id)){
      d.className = 'owned-token';
      d.style.borderColor = 'rgba(28,255,175,.36)';
      d.style.boxShadow = '0 0 0 1px rgba(28,255,175,.12) inset,0 0 18px rgba(28,255,175,.12)';
    }
    // jv: "I want the token badges the same on desktop as they are on
    // mobile. Nothing on the image." _gridCard only ever renders for one
    // of the three dense-grid modes (standard/grid5/compact -- there's no
    // separate "default" mode beyond these plus list), so these three
    // overlay divs always applied here, on mobile, regardless of mode --
    // removed to match the retrofit logic already removed above
    // (applyViewMode's compact-price-badge, the CSS ::before/::after rank
    // and id badges), so mobile's non-minimal theme renders the same
    // "nothing on the image" tile desktop now does, rather than only the
    // minimal theme matching.
    d.innerHTML =
      (imgSrc ? `<img src="${imgSrc}" loading="eager" decoding="async" fetchpriority="high" style="width:100%;height:100%;object-fit:contain;image-rendering:auto;display:block;backface-visibility:hidden;-webkit-backface-visibility:hidden">` : '<div style="width:100%;height:100%;background:color-mix(in srgb, var(--text) 5%, transparent)"></div>');
    if(connectedWalletOwns(id)) d.insertAdjacentHTML('beforeend', '<span class="vs-owned-badge">Owned</span>');
    d.addEventListener('click', () => openModal(id));
    return d;
  },


  async _standardCard(id){
    // jv: "images populated after sitting on the site for like 3 minutes"
    // and "Badges should be there just as they display on mobile." Both
    // land on the same fix. The await fetchRow(id) this used to do was
    // for row.traits, which fed traitsMiniHtml(row) inside .tmeta -- but
    // .tmeta is unconditionally hidden by applyViewMode() for all three
    // modes this function is ever called in (standard/grid5/compact,
    // the only three modes _standardCard exists for -- there's no other,
    // "default" mode beyond these plus list), so that trait data was
    // never actually visible to begin with. Meanwhile that same await,
    // firing once per visible card on every _paint() (i.e. every scroll
    // tick), was almost certainly the real driver behind cards taking
    // minutes to populate on a grid showing dozens of them per screen --
    // dozens of simultaneous network requests competing on every repaint.
    // _gridCard (mobile's equivalent builder for these same three modes)
    // already needs zero network calls -- rank, price and the image
    // itself all resolve synchronously from already-loaded state -- and
    // its own styling has no mobile-specific pixel values, just relative
    // sizing that fills whatever grid cell the surrounding CSS
    // (view-2x2/view-5x5/compact) allocates it. Delegating to it directly
    // rather than keeping a second, separately-maintained copy of the
    // same logic guarantees desktop and mobile are the literal same code
    // path from here on, not just visually matched once.
    return this._gridCard(id);
  },

  _listCard(id){
    const rank = RARITY_OBS_RANK.get(id);
    const price = window.LISTINGS?.[id]?.opensea?.price_eth;
    const priceStr = price != null ? (price >= 1 ? price.toFixed(3) : price.toFixed(4)) : null;
    const imgSrc = this._imgSrc(id);
    const d = document.createElement('div');
    d.dataset.id = id;
    d.style.cssText = 'display:grid;grid-template-columns:60px 1fr;gap:8px 10px;padding:8px 10px;border-radius:10px;border:1px solid color-mix(in srgb, var(--text) 10%, transparent);cursor:pointer;background:color-mix(in srgb, var(--text) 3%, transparent);flex-shrink:0;align-items:start;box-sizing:border-box';
    if(connectedWalletOwns(id)){
      d.className = 'owned-token';
      d.style.borderColor = 'rgba(28,255,175,.36)';
      d.style.boxShadow = '0 0 0 1px rgba(28,255,175,.10) inset,0 0 18px rgba(28,255,175,.10)';
    }
    d.innerHTML =
      `<div style="width:60px;height:60px;min-width:60px;border-radius:8px;overflow:hidden;background:color-mix(in srgb, var(--text) 6%, transparent);flex-shrink:0">` +
      (imgSrc ? `<img src="${imgSrc}" loading="eager" decoding="async" fetchpriority="high" style="width:100%;height:100%;object-fit:contain;image-rendering:auto;display:block;backface-visibility:hidden;-webkit-backface-visibility:hidden">` : '') +
      `</div>` +
      `<div style="min-width:0;overflow:visible;display:flex;flex-direction:column;gap:3px">` +
      `<div style="font-weight:700;font-size:13px;margin-bottom:2px;color:var(--text)">#${id}</div>` +
      listStatsRowHtml(id, rank, priceStr) +
      `</div>` +
      (connectedWalletOwns(id) ? '<span class="vs-owned-badge" style="top:8px;right:8px;bottom:auto">Owned</span>' : '');
    // Apply scroll styles directly to the datarow so it stays within the meta column
    const statsRow = d.querySelector('.vs-datarow');
    if(statsRow){
      statsRow.style.cssText = 'display:flex;flex-direction:row;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;border-top:1px solid color-mix(in srgb, var(--text) 7%, transparent);padding-top:7px;margin-top:2px;gap:0;scroll-snap-type:x mandatory;overscroll-behavior-x:contain;touch-action:pan-x pan-y;-webkit-mask-image:linear-gradient(to right,#000 75%,transparent 100%);mask-image:linear-gradient(to right,#000 75%,transparent 100%);width:100%;max-width:100%';
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
    // Ground-truth survivor image beats the static manifest -- see
    // _getTokenImgSrc's comment for why this can't just rely on OpenSea.
    const survivorImg = window.SURVIVOR_IMAGE_MAP && window.SURVIVOR_IMAGE_MAP.get(id);
    if(survivorImg) return survivorImg;
    // Confirmed live: this is a separate, parallel implementation to
    // _getTokenImgSrc (used by the mobile virtual-scroller grid
    // specifically) that never checked CHUNK_CACHE's live DB-sourced image
    // at all -- would have shown no image whatsoever for any non-OCAS
    // collection on mobile once imgForId() was fixed to stop returning
    // OCAS's own wrong image as a fallback. Same fix as _getTokenImgSrc:
    // check the live DB data pre-warmed into CHUNK_CACHE before falling
    // through to OCAS's own static-file system.
    const chunk = (typeof CHUNK_CACHE !== 'undefined') ? CHUNK_CACHE.get(chunkIndexFor(id)) : null;
    const dbImg = chunk && chunk[String(id)] && chunk[String(id)].image;
    // jv: "The backgrounds be still have those lines in them." Same
    // missing _svgCrisp() fix as _getTokenImgSrc's identical dbImg
    // branch -- and given this parallel implementation is specifically
    // the one used by the mobile virtual-scroller grid (per the comment
    // above), and jv's own screenshots showing this were taken on
    // mobile, this may well be the exact code path responsible.
    if(dbImg) return String(dbImg).startsWith('<svg')
      ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(_svgCrisp(dbImg))
      : dbImg;
    // jv: "OCAS keeps showing up in the other collections when I load it
    // up from the landing page." Same cross-collection collision bug class
    // already fixed at imgForId() and _getTokenImgSrc() elsewhere in this
    // file, missing here specifically: IMAGES_MAP is only ever populated
    // from OCAS's own static files, keyed purely by numeric token ID with
    // zero collection awareness. Right after a fresh landing-page
    // navigation, CHUNK_CACHE hasn't necessarily finished warming every
    // visible token's image yet -- falling through to IMAGES_MAP
    // unguarded in that gap silently showed OCAS's own token #7385/#7177
    // for cryptoadz's completely different tokens with the same numeric
    // IDs. Matching imgForId()'s own guard: only OCAS itself may ever read
    // this map.
    if(LIVE_SLUG === 'on-chain-all-stars'){
      const v = IMAGES_MAP?.get(id);
      const s = v ? String(v).trim() : null;
      if(s && s.startsWith('<svg')){ try{ return 'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(_svgCrisp(s)); }catch(e){ return imgForId(id); } }
      if(s && s.startsWith('data:')) return s;
      if(s) return ipfsToHttp(s);
    }
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
    fetch(`${LIVE_ENDPOINT}/os/owner?contract=${LIVE_CONTRACT}&tokenId=${id}&chain=${LIVE_CHAIN}`)
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
    this.bufferRows = window._tvIsPhone() ? 6 : 3;
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
// jv (theme audit): every Plotly chart used gridcolor rgba(255,255,255,.06)
// -- white gridlines, invisible on the light theme. Derived from the
// active theme's text color instead (same idea as the CSS pass that
// turned white tints into color-mix(var(--text) ...)): on dark themes
// that's still a faint light line, on light it's a faint dark one.
function _themeGrid(a){
  const t = (getComputedStyle(document.documentElement).getPropertyValue('--text') || '').trim();
  return /^#[0-9a-f]{6}$/i.test(t) ? rgbaFromHex(t, a || .08) : 'rgba(255,255,255,.06)';
}
// Chart highlight colors (Plotly can't read CSS variables): the dark-theme
// pastels (gold/lavender/pastel red) wash out on the light theme's grey
// background, so light gets deeper shades of the same hues. Must match
// the light-theme text-color mapping in styles.css so dots and tooltip
// text agree.
function _chartPalette(){
  const light = document.documentElement.getAttribute('data-theme') === 'minimal-light';
  return light
    // bgDot: the "All Sales" cloud. jv: "The grey dots are hard to read
    // against the background... need to change the color of those dots."
    // The dark-theme grey at 18% is a soft haze on dark but grey-on-grey
    // on light; light gets a deeper slate blue at ~2x the opacity (dense
    // areas still build up darker, so clustering stays visible).
    ? { gold:'#b7791f', purple:'#7c3aed', purpleLine:'rgba(124,58,237,.9)', red:'#dc2626', redOutline:'#fca5a5', bgDot:'rgba(51,65,85,.34)' }
    : { gold:'#ffd76a', purple:'#c9a9ff', purpleLine:'rgba(201,169,255,.95)', red:'#f87171', redOutline:'#fecaca', bgDot:'rgba(140,145,155,.18)' };
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
  // Same fix as downloads.js's identical hardcoded-OCAS branding text.
  const _cardCollectionName = (typeof COLLECTIONS !== 'undefined' && typeof LIVE_SLUG !== 'undefined' && COLLECTIONS[LIVE_SLUG]?.name) || 'TraitView';
  const _cardNameSpaceIdx = _cardCollectionName.indexOf(' ');
  const _cardNameFirst = (_cardNameSpaceIdx === -1 ? _cardCollectionName : _cardCollectionName.slice(0, _cardNameSpaceIdx)).toUpperCase();
  const _cardNameRest = _cardNameSpaceIdx === -1 ? '' : _cardCollectionName.slice(_cardNameSpaceIdx + 1).toUpperCase();
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(_cardNameFirst, x, y);
  if(_cardNameRest){
    ctx.fillStyle = '#1CFFAF';
    ctx.fillText(_cardNameRest, x + ctx.measureText(_cardNameFirst).width + 12, y);
  }
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
    // Same fix as downloadTokenPng/downloadShareCardPng's filename.
    const slugPrefix = (typeof LIVE_SLUG !== 'undefined' && LIVE_SLUG) ? LIVE_SLUG : 'ocas';
    await _downloadCanvasAsPng(canvas, `${slugPrefix}-${STUDIO_TOKEN_ID}-studio-card.png`);
  }catch(e){
    console.error('TraitView Studio export:', e);
    alert('Studio export error: ' + (e?.message || String(e)));
  }finally{
    if(typeof _setDownloadBtnState === 'function') _setDownloadBtnState(btn, 'Export PNG', false);
  }
}

/* SVG download helper moved to js/downloads.js */

window.addEventListener('resize', ()=>{
  // jv confirmed live (root cause of "switching grids doesn't work,"
  // found via the diagnostic logging from the previous exchange):
  // VS is declared with `const VS = {...}` at the top level of this
  // regular (non-module) script -- top-level const/let never attaches
  // to window, only var does, even though the bare identifier VS still
  // works correctly everywhere via ordinary lexical scoping. This
  // window.VS check is always false as a result (window.VS is always
  // undefined), so this whole block silently never ran on resize either.
  if(VS.enabled && Array.isArray(VS.ids) && VS.ids.length){
    clearTimeout(window.__vsResizeTimer);
    window.__vsResizeTimer = setTimeout(()=>{
      const v = localStorage.getItem('viewMode') || 'standard';
      VS.init(VS.ids, _vsModeFor(v));
    }, 120);
  }
});

// init() handles ?jump= URL param internally after full data loads
// jv: bare-root visits show a landing page instead (see the inline script
// at the top of <head>) -- skip the full data fetch entirely while it's
// showing, since the grid/traits UI it loads isn't even visible. Once the
// user picks a collection from the landing page, that navigates to
// ?collection=slug (a real page load), which naturally clears this flag.
if(!window.__TV_LANDING__) init();

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
    // jv confirmed live (fourth report of "switching grids doesn't work"
    // after four separate real bugs already found and fixed in this
    // area): logging every step of this decision now rather than
    // continuing to guess at a fifth. Shows exactly what mode was
    // clicked, what _vsModeFor resolved it to, and what VS.init actually
    // ends up with for cols/rowH/tg's className immediately after --
    // the next report can quote this instead of just "still broken."
    const resolvedMode = _vsModeFor(v);
    console.log(`[ViewSwitch] clicked=${v} resolvedMode=${resolvedMode} VS.enabled=${!!(VS&&VS.enabled)} VS.ids.length=${VS?.ids?.length}`);
    if(VS && VS.enabled && Array.isArray(VS.ids) && VS.ids.length){
      VS.init(VS.ids, resolvedMode).then(() => {
        const tg = document.getElementById('tokenGrid');
        console.log(`[ViewSwitch] after VS.init: VS.mode=${VS.mode} VS.cols=${VS.cols} VS.rowH=${VS.rowH} tg.className="${tg?.className}"`);
      });
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
// Runs AFTER the neon theme restoration above, so a saved minimal theme
// choice correctly overrides it on load (rather than the reverse -- minimal
// mode is meant to fully replace the neon look while it's active, not sit
// underneath it). Deferred the same way the IIFE above defers its own
// second pick(saved) call -- without this, that delayed call would run
// after this one and silently overwrite a saved minimal theme back to neon.
restoreMinimalThemeOnLoad();
setTimeout(restoreMinimalThemeOnLoad, 0);
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
        u.searchParams.set('chain', LIVE_CHAIN);
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
          const _sc = _vsPageScroller(tg);
          const keep = tg.scrollTop, keepPage = _sc.scrollTop;
          await renderTokenGridFromState();
          tg.scrollTop = keep;
          if(window._tvIsPhone()) _sc.scrollTop = keepPage; // mobile: the page is the scroller
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

// jv: "when the page first loads it loads with the bottom bar 1/4 of the
// way up the page" -- #mobileBottomBar is plain position:fixed;bottom:0
// with nothing dynamic touching it in JS, and reproducing this locally
// (headless Chromium, same viewport size) shows it correctly pinned to the
// real viewport bottom immediately after load -- so this isn't a CSS
// positioning bug at all, but a known, long-standing iOS Safari quirk:
// position:fixed elements present during the page's very first layout can
// get frozen relative to the viewport height AT THAT EXACT MOMENT (often
// mid-transition while the address bar is still collapsing from its
// initial expanded state), and stay stuck there until something forces a
// fresh layout pass -- which is likely why jv sees it settle if the page
// scrolls or resizes at all afterward. This can't be reproduced in a
// simulation that doesn't share Safari's own address-bar-collapse
// behavior, so the fix is the standard workaround for this exact class of
// bug: force one extra layout recalculation shortly after load completes,
// which is enough to make Safari re-anchor the element to the viewport's
// actual current bottom edge.
(function(){
  const bar = document.getElementById('mobileBottomBar');
  if(!bar) return;
  const nudge = () => {
    // Reading offsetHeight forces a synchronous layout; toggling display
    // off then back on forces Safari to fully recompute this element's
    // fixed position against the viewport as it actually is right now,
    // rather than whatever it was anchored to during the very first paint.
    void bar.offsetHeight;
    bar.style.display = 'none';
    void bar.offsetHeight;
    bar.style.display = '';
  };
  window.addEventListener('load', () => setTimeout(nudge, 50), { once:true });
  // Also nudge after the very first user scroll/touch, since that's exactly
  // the moment Safari's address bar finishes collapsing if it hasn't
  // already -- covers the case where the fixed load-time nudge above still
  // lands mid-transition on a particularly slow load.
  //
  // jv: "The only time there is [lag] is when you first scroll on the main
  // grid but after it gets through the little pause it's smooth." This
  // nudge WAS that pause: it ran synchronously on the first scroll AND
  // the first touchmove (twice), each time forcing two full-page layouts
  // (offsetHeight reads) plus a rebuild of the bar's backdrop-blur layer
  // -- right as the finger started moving and the grid was still loading
  // images. Now it runs once, only after scrolling (any scroller,
  // including the grid's own, plus iOS momentum) has been still for
  // ~250ms, and in idle time -- same fix, landing in a gap instead of
  // on top of the gesture.
  let armed = false, done = false, settleTimer = null;
  const runWhenIdle = () => {
    if(done) return; done = true;
    document.removeEventListener('scroll', onScroll, true);
    (window.requestIdleCallback || (fn => setTimeout(fn, 0)))(nudge, { timeout: 1000 });
  };
  const onScroll = () => {
    if(!armed || done) return;
    clearTimeout(settleTimer);
    settleTimer = setTimeout(runWhenIdle, 250);
  };
  const arm = () => { if(armed) return; armed = true; onScroll(); };
  window.addEventListener('touchmove', arm, { once:true, passive:true });
  window.addEventListener('scroll', arm, { once:true, passive:true });
  document.addEventListener('scroll', onScroll, { capture:true, passive:true });
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
  // jv: Argonauts' Sales tab was showing OCAS's sales. Traced to this exact
  // line -- confirmed live: LIVE_SLUG was captured into OS_SLUG only ONCE,
  // at the moment this IIFE first runs (page load). LIVE_SLUG itself DOES
  // update correctly when switching collections via the dropdown
  // (_applyCollectionSwitch() re-assigns it), but this const never re-reads
  // it afterward -- every fetchPage() call kept using whatever collection
  // was active at the very first page load, regardless of what's actually
  // selected now. A prior fix already replaced a literal, hardcoded OCAS
  // slug string with this same broken pattern -- it fixed the WRONG
  // collection showing on first load, but not staying wrong after a switch.
  // Reading window.LIVE_SLUG fresh inside fetchPage() itself instead, so
  // every single fetch reflects whatever's actually selected at call time.
  const PAGE_SIZE   = 100;   // max OpenSea allows per request
  const REFRESH_MS  = 60000; // auto-refresh interval for newest sales

  let ALL_SALES      = [];          // full accumulated sale list (grows with Load More)
  let nextCursor     = null;        // OpenSea pagination cursor for older sales
  let salesKnownIds  = new Set();   // for new-sale flash animation
  let isLoadingMore  = false;
  let autoRefreshTimer = null;
  // jv: "I don't think all of the sales for the trait counts are showing...
  // I want full history" -- filtering ALL_SALES (OpenSea's own paginated
  // recent-events feed, 100 at a time) can only ever show matches within
  // whatever's currently loaded, never genuinely full history without
  // repeatedly clicking Load More. null when no search/count filter is
  // active (normal recent-sales view); an array (this collection's own
  // full sales history matching the current search/count, via the new
  // /db/sales-search endpoint) whenever one is.
  let _fullHistorySales = null;
  let _salesSearchDebounce = null;
  // jv: "add a sales filter... highest and lowest sale" -- applied as a
  // sort over whatever's already showing (toShow in renderSales below),
  // AFTER the existing trait/trait-count filtering, so it works in
  // combination with those rather than replacing them. 'newest' (the
  // existing default order, unsorted) needs no special handling.
  let salesSortMode = 'newest';

  // Debounced so a fast typist doesn't fire a request per keystroke --
  // only the settled text actually triggers a fetch, matching how a
  // search box like this normally behaves.
  function _scheduleSalesSearch(){
    if(_salesSearchDebounce) clearTimeout(_salesSearchDebounce);
    _salesSearchDebounce = setTimeout(_runSalesSearch, 300);
  }

  async function _runSalesSearch(){
    const q = (document.getElementById('salesTraitSearch')?.value || '').trim();
    const hasQ = q.length > 0;
    const hasCount = typeof currentTraitCount !== 'undefined' && currentTraitCount !== null;
    if(!hasQ && !hasCount){
      _fullHistorySales = null;
      renderSales(false);
      return;
    }
    const grid = document.getElementById('salesGrid');
    if(grid) grid.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:10px 0">Searching full sales history…</div>';
    try{
      const params = {};
      if(hasQ) params.q = q;
      if(hasCount) params.trait_count = currentTraitCount;
      const data = await dbFetch('/db/sales-search', params);
      if(!data.ok) throw new Error(data.error || 'search failed');
      // Transform this endpoint's plain DB shape into the same OpenSea
      // event shape renderSales() already expects everywhere else (same
      // transformation buildPriceHistory() already does for
      // /db/token-sales). jv confirmed live: this used IMAGES_MAP directly,
      // which only ever gets populated for OCAS -- every other collection's
      // full-history search results showed no image at all, same bug class
      // already fixed in buildMispricedPanel. _getTokenImgSrcAsync() is the
      // correct, collision-safe, per-collection lookup chain everything
      // else on the site already uses.
      _fullHistorySales = await Promise.all((data.sales || []).map(async s => {
        const imgSrc = (typeof _getTokenImgSrcAsync === 'function') ? await _getTokenImgSrcAsync(s.token_id) : null;
        return {
          event_timestamp: new Date(s.sale_ts).getTime() / 1000,
          payment: { quantity: String(Math.round((s.price_eth||0) * 1e18)), decimals: 18, symbol: s.currency || 'ETH' },
          nft: { identifier: String(s.token_id), image_url: imgSrc || null },
          transaction: null,
          seller: s.seller ? { address: s.seller } : null,
          buyer:  s.buyer  ? { address: s.buyer  } : null,
        };
      }));
      renderSales(false);
    }catch(e){
      console.warn('[SalesSearch] failed:', e.message);
      if(grid) grid.innerHTML = `<div style="color:var(--tc-f87171);font-size:12px;padding:10px 0">Search failed: ${e.message}</div>`;
    }
  }

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
    // jv confirmed live on nekoadz: a sale in the chain's real currency
    // (e.g. USDG on Robinhood Chain) displayed as "8 ETH" -- this
    // function assumed ANY non-zero, non-WETH payment address must still
    // be WETH, and the symbol fallback below it only ever checked for the
    // literal string 'WETH', silently discarding any other real symbol
    // (like "USDG") the backend had already correctly stored and passed
    // through. Now returns the real symbol whenever one is actually
    // present, only falling back to the ETH/WETH guess when there's
    // truly nothing else to go on.
    const sym = (event.payment?.symbol || '').toUpperCase();
    if(sym) return sym;
    if(addr && addr !== '0x0000000000000000000000000000000000000000') return 'WETH';
    return 'ETH';
  }
  function getSaleCurrencyColor(event){
    const cur = getSaleCurrency(event);
    // jv: "make the weth and eth wording through the page green for eth
    // and red for weth" -- this used lavender for WETH, not red. Unifying
    // with the same green/red scheme applied everywhere else this
    // session (listStatsRowHtml, priceBadgeHtml, the wallet-view cards,
    // the mispriced/similar-tokens tooltips) rather than leaving sales
    // as the one remaining place with a different color for the same
    // meaning.
    if(cur === 'WETH') return '#f87171';
    if(cur === 'ETH') return '#2dd4bf';
    return '#facc15'; // any other real currency (e.g. USDG) gets its own distinct color
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
    const nftTraits = sale.nft?.traits || [];
    // jv: "the ability to be able to filter the sales through traits or
    // trait counts would be very nice" -- trait VALUE filtering already
    // applied here (both this function and the main grid read the same
    // activeTraits state). Trait COUNT (the "Traits: N" pills,
    // currentTraitCount) uses countSaleTraits() (traitUtils.js) rather than
    // nftTraits.length directly -- confirmed live on Argonauts that raw
    // length never matched at all, since OpenSea's own sale payload
    // includes every attribute (Bones/Palette/Print/Fate) while
    // currentTraitCount is the corrected worn-trait-only count. Same
    // per-collection exclusion list as getTraitCount(), just adapted for
    // the array shape a sale event uses instead of row.traits' object shape.
    if(typeof currentTraitCount !== 'undefined' && currentTraitCount !== null){
      if(countSaleTraits(nftTraits) !== currentTraitCount) return false;
    }
    if(traitMap.size === 0) return true;
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
      slug:       LIVE_SLUG,
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
    // jv: "having sales tabs issue now across all collections... Could not
    // load sales: OpenSea API failed: 401." The worker's own /os/events
    // endpoint (js/chart.js's OpenSea call is separate, this hits a
    // Cloudflare Worker with its own OPENSEA_API_KEY secret) already
    // captures body_snippet from OpenSea's actual response when it fails,
    // but this only ever surfaced the bare status code, discarding it. A
    // 401 specifically on /os/events while stats/listings/traits (same
    // worker, same key) keep working points at something scoped to this
    // one endpoint rather than a fully dead key -- OpenSea's own error
    // text will say plainly whether that's an invalid key, a required
    // higher API tier for this endpoint, or something else, instead of
    // guessing from a status code alone.
    if(!j.ok) throw new Error((j.error || 'Worker returned ok:false') + (j.body_snippet ? ` — ${j.body_snippet}` : ''));
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
      // jv: "the sales tab doesn't load sales UNLESS there is a filter on
      // which is weird to me" -- confirmed why: applying a trait-count
      // filter already routes through _runSalesSearch -> /db/sales-search
      // (this repo's own backend, its own already-synced sales data),
      // completely bypassing the Cloudflare Worker this unfiltered path
      // depends on -- whose separate OPENSEA_API_KEY secret is what's
      // actually returning "Invalid API key". Rather than surface an
      // error when a perfectly good data source already exists one call
      // away, fall back to that same healthy endpoint here too, unfiltered
      // (most recent sales for this collection), only when the worker
      // itself is the thing that failed.
      try{
        const data = await dbFetch('/db/sales-search', { limit: String(PAGE_SIZE) });
        if(!data.ok) throw new Error(data.error || 'fallback search failed');
        const fallbackSales = await Promise.all((data.sales || []).map(async s => {
          const imgSrc = (typeof _getTokenImgSrcAsync === 'function') ? await _getTokenImgSrcAsync(s.token_id) : null;
          return {
            event_timestamp: new Date(s.sale_ts).getTime() / 1000,
            payment: { quantity: String(Math.round((s.price_eth||0) * 1e18)), decimals: 18, symbol: s.currency || 'ETH' },
            nft: { identifier: String(s.token_id), image_url: imgSrc || null },
            transaction: null,
            seller: s.seller ? { address: s.seller } : null,
            buyer:  s.buyer  ? { address: s.buyer  } : null,
          };
        }));
        ALL_SALES = fallbackSales;
        salesKnownIds.clear();
        nextCursor = null; // this fallback has no worker-style pagination cursor
        await renderSales(false);
        setStatus('idle');
      }catch(fallbackErr){
        console.warn('[Sales] fetchNewest fallback also failed:', fallbackErr);
        setStatus('error', e.message);
      }
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
    // jv's trait-count filtering request needs this to also fire when only
    // currentTraitCount is set with no individual trait values selected --
    // traitMap.size alone would miss that case entirely.
    const hasTraitFilter = traitMap.size > 0 || (typeof currentTraitCount !== 'undefined' && currentTraitCount !== null);

    // _fullHistorySales (set by _runSalesSearch whenever a search/count
    // filter is active) is already exactly the matching set, queried
    // directly from this collection's own full sales history -- no need to
    // additionally filter it against the loaded-recent-sales-only
    // saleMatchesTraitFilter() the way the old ALL_SALES path still needs.
    const usingFullHistory = _fullHistorySales !== null;
    let toShow = usingFullHistory ? _fullHistorySales : ALL_SALES;
    if(!usingFullHistory && hasTraitFilter) toShow = ALL_SALES.filter(saleMatchesTraitFilter);

    // jv: "add a sales filter... highest and lowest sale." Sorts whatever
    // survived the trait/trait-count filtering above, so it combines with
    // those rather than overriding them. formatSaleEth already correctly
    // resolves the real decimals per sale (not a hardcoded assumption) --
    // reused here rather than a second, parallel price-parsing path.
    if(salesSortMode === 'price-desc' || salesSortMode === 'price-asc'){
      toShow = [...toShow].sort((a, b) => {
        const av = parseFloat(formatSaleEth(a)) || 0;
        const bv = parseFloat(formatSaleEth(b)) || 0;
        return salesSortMode === 'price-desc' ? bv - av : av - bv;
      });
    }

    // filter note
    const note = document.getElementById('salesFilterNote');
    if(note) note.style.display = (hasTraitFilter || usingFullHistory) ? 'block' : 'none';

    // count badge
    const badge = document.getElementById('salesCountBadge');
    if(badge){
      if(usingFullHistory){
        badge.textContent = `${toShow.length} matching (full history)`;
      } else {
        const total = toShow.length;
        const loaded = ALL_SALES.length;
        badge.textContent = hasTraitFilter
          ? `${total} matching / ${loaded} loaded`
          : `${loaded} loaded`;
      }
    }

    const grid = document.getElementById('salesGrid');
    if(!grid) return;

    if(!toShow.length){
      grid.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:10px 0">' +
        (usingFullHistory ? 'No sales match this search in this collection\'s full history.'
          : hasTraitFilter ? 'No sales match the selected traits in the loaded history. Try loading more below.'
          : 'No sales found.') +
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
        : `<div style="color:var(--sub);font-size:11px;padding:8px">No image</div>`;

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
            ${eth ? `<span class="sale-price" style="color:${getSaleCurrencyColor(sale)}">${['ETH','WETH'].includes(getSaleCurrency(sale)) ? 'Ξ ' : ''}${eth} <span style="font-size:10px;opacity:.8">${getSaleCurrency(sale)}</span></span>` : ''}
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
    // "Load More" is meaningless for a full-history search result --
    // /db/sales-search already returns everything matching, up to its own
    // limit, with no pagination cursor concept at all.
    if(_fullHistorySales !== null){
      btn.style.display = 'none';
      return;
    }
    btn.style.display = 'block';
    btn.disabled = !nextCursor || isLoadingMore;
    btn.textContent = nextCursor ? 'Load More Sales ↓' : 'All sales loaded';
  }

  // ── status helper ─────────────────────────────────────────────────────────
  function setStatus(state, msg){
    const grid = document.getElementById('salesGrid');
    if(state === 'loading' && !ALL_SALES.length && grid){
      grid.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:10px 0">Loading sales…</div>';
    }
    if(state === 'error' && !ALL_SALES.length && grid){
      grid.innerHTML = `<div style="color:var(--tc-f87171);font-size:12px;padding:10px 0">Could not load sales: ${msg || 'unknown error'}</div>`;
    }
  }

  // ── public hook: called when trait filters change ─────────────────────────
  window.renderSalesForCurrentTraits = function(){ renderSales(false); };

  // jv: Argonauts' Sales tab was showing OCAS's sales -- fetchPage()'s slug
  // fix above handles that for any fetch going forward, but the sales tab
  // could still be showing a PREVIOUS collection's already-loaded sales
  // (and its own already-set auto-refresh timer, which would otherwise keep
  // re-fetching that stale slug forever) at the moment of a switch itself.
  // Exposed so resetCollectionState() (config.js, already the single place
  // every other per-collection cache gets cleared on a switch) can clear
  // this state too and force an immediate re-fetch for the newly active
  // collection.
  window.resetSalesState = function(){
    ALL_SALES = [];
    nextCursor = null;
    salesKnownIds.clear();
    if(autoRefreshTimer) clearInterval(autoRefreshTimer);
    fetchNewest(false);
    autoRefreshTimer = setInterval(()=> fetchNewest(true), REFRESH_MS);
  };

  // jv: "put the filtering options up top" (matching the Mispriced tab's
  // own visible controls) -- these back the new #salesTraitCountFilter
  // dropdown and #salesClearFilterBtn added directly to the Sales tab in
  // index.html. currentTraitCount/activeTraits are the same shared,
  // global filter state the main grid already uses (see
  // saleMatchesTraitFilter above) -- setting them from here keeps
  // everything in sync: switching to the Traits tab shows the identical
  // filter already applied, not a separate, Sales-only filter state.
  window.setSalesSortMode = function(value){
    salesSortMode = value;
    renderSales();
  };

  window.setSalesTraitCountFilter = function(value){
    currentTraitCount = value === '' ? null : Number(value);
    document.querySelectorAll('#traitChips .chip').forEach(n => n.classList.toggle('active', Number(n.dataset.count) === currentTraitCount));
    if(typeof renderTokenGridFromState === 'function') renderTokenGridFromState();
    if(typeof LAST_XS !== 'undefined' && typeof colorsFor === 'function' && typeof Plotly !== 'undefined'){
      const cols2 = colorsFor(LAST_XS);
      Plotly.restyle('chartHost', {'marker.color':[cols2.fill], 'marker.line.color':[cols2.line]}, [0]);
    }
    syncSalesFilterUI();
    // jv: "I don't think all of the sales for the trait counts are
    // showing... I want full history" -- a discrete dropdown change (not
    // continuous typing) runs the full-history search immediately, no
    // debounce needed.
    _runSalesSearch();
  };

  // jv: "can there be a pill for trait counts when it's selected so I
  // can close out of it if I want" -- clears only currentTraitCount,
  // same scope as the dropdown's own Any option, so any trait-value
  // filters or search text stay exactly as they were.
  //
  // jv: "when a trait count is selected and a trait is selected and i
  // click the trait count pill to close it, it removed [the value
  // pill] in the trait filters panel" -- confirmed: this called
  // renderTokenGridFromState() alone instead of updateChartAndList(),
  // the actual full, coordinated refresh the Traits tab's own
  // (working, proven) equivalent pill uses -- computeFilteredState(),
  // a fresh renderTraitChips(), renderTraitAccordion(), and
  // renderActiveChips() all in the right order, not just the grid.
  // Skipping that chain was what let activeTraits (Crown: Purphat, in
  // this report) end up cleared alongside the trait count, since
  // whatever kept it correctly in sync depended on this full sequence
  // running, not just the grid re-rendering. Matching that proven
  // sequence exactly now, plus the one thing specific to being on the
  // Sales tab (_runSalesSearch(), to refresh the actual sales list).
  window.clearSalesTraitCountFilter = async function(){
    currentTraitCount = null;
    document.querySelectorAll('#traitChips .chip').forEach(n => n.classList.remove('active'));
    syncSalesFilterUI();
    await updateChartAndList();
    _runSalesSearch();
  };

  window.clearSalesFilters = function(){
    currentTraitCount = null;
    if(typeof activeTraits !== 'undefined' && activeTraits.clear) activeTraits.clear();
    document.querySelectorAll('#traitChips .chip').forEach(n => n.classList.remove('active'));
    document.querySelectorAll('#accTraits input[type=checkbox]').forEach(cb => cb.checked = false);
    const searchInput = document.getElementById('salesTraitSearch');
    if(searchInput) searchInput.value = '';
    _fullHistorySales = null;
    if(typeof renderActiveChips === 'function') renderActiveChips();
    if(typeof renderTokenGridFromState === 'function') renderTokenGridFromState();
    syncSalesFilterUI();
    renderSales(false);
  };

  // jv: "what I had in mind when I wanted the search feature is the trait
  // sales to auto populate as I type. So I can type gold and all sales
  // with gold traits will show." Redesigned from requiring an exact,
  // complete "Name: value" datalist match to live substring search --
  // every keystroke (debounced) now queries /db/sales-search directly, a
  // free-text ILIKE match against either trait name or value in this
  // collection's own full sales history, not just an exact pair within
  // whatever's currently loaded. The <datalist> autocomplete jv
  // specifically wants kept stays exactly as-is (built in
  // renderTraitChips from TRAIT_DOMAIN) -- it's just no longer the ONLY
  // way this box does anything; typing "gold" now works whether or not it
  // matches a suggestion exactly.
  window.setSalesTraitSearch = function(text){
    _scheduleSalesSearch();
  };

  // Keeps the Sales tab's own dropdown/note/clear-button in sync with
  // whatever the actual filter state is, regardless of whether it was just
  // changed from THIS tab's dropdown, the main filter panel's trait-count
  // pills, or an individual trait checkbox -- there's one shared state,
  // and every place that can display or change it needs to reflect the
  // same thing.
  function syncSalesFilterUI(){
    const sel = document.getElementById('salesTraitCountFilter');
    if(sel) sel.value = (currentTraitCount == null) ? '' : String(currentTraitCount);
    // jv: "can there be a pill for trait counts when it's selected so I
    // can close out of it if I want just like how traits does it" --
    // the Traits tab's own currentTraitCount pill (renderActiveChips())
    // only ever rendered into #activeChips there, so it was invisible
    // while actually on the Sales tab even though the filter was fully
    // in effect there too (currentTraitCount is the same shared global
    // state both tabs read). This is that same pill's Sales-tab
    // equivalent -- clears just this one filter, same as the Traits
    // tab's version does, leaving any trait-value filters or search
    // text alone.
    const countPill = document.getElementById('salesTraitCountPill');
    if(countPill){
      countPill.style.display = (currentTraitCount == null) ? 'none' : '';
      const val = document.getElementById('salesTraitCountPillVal');
      if(val) val.textContent = currentTraitCount == null ? '' : String(currentTraitCount);
    }
    const hasTraitValues = typeof getActiveTraitMap === 'function' && getActiveTraitMap().size > 0;
    const searchInput = document.getElementById('salesTraitSearch');
    const hasSearchText = !!(searchInput && searchInput.value.trim());
    const hasAnyFilter = hasTraitValues || hasSearchText || (typeof currentTraitCount !== 'undefined' && currentTraitCount !== null);
    const note = document.getElementById('salesFilterNote');
    if(note) note.style.display = hasAnyFilter ? '' : 'none';
    const clearBtn = document.getElementById('salesClearFilterBtn');
    if(clearBtn) clearBtn.style.display = hasAnyFilter ? '' : 'none';
    // jv confirmed live: opening the Sales tab (or switching to it) with a
    // trait count already active elsewhere (e.g. set from the Traits tab)
    // showed the dropdown correctly pre-selected to that value, but the
    // actual matching sales never loaded until manually re-selecting a
    // DIFFERENT value from the dropdown -- because setting sel.value
    // programmatically (the line right above) never fires a change event,
    // and _runSalesSearch() only ever runs from that event handler. Only
    // trigger it here when we don't already have a matching result set
    // loaded (_fullHistorySales is only non-null once a real search has
    // actually completed for the current filter), so this doesn't cause a
    // redundant re-fetch on every ordinary state refresh this function
    // already runs on.
    if(hasAnyFilter && _fullHistorySales === null && typeof _runSalesSearch === 'function') _runSalesSearch();
    // jv wanted the search box driven by live, free-text substring search
    // against this collection's full sales history (via /db/sales-search),
    // not by activeTraits -- it no longer reads or writes that shared
    // state at all, so there's nothing here to reflect back into it beyond
    // what the user directly typed. clearSalesFilters() already empties it
    // explicitly when the Clear button is pressed.
  }
  window.syncSalesFilterUI = syncSalesFilterUI;

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
  // jv: landing page loading slowly on a hotspot. Opening a collection
  // from the landing page is a full page load (?collection=slug), where
  // everything below starts fresh anyway -- so on the landing page this
  // was pure background traffic competing with the landing cards.
  if(!window.__TV_LANDING__){
    fetchNewest(false);
    autoRefreshTimer = setInterval(()=> fetchNewest(true), REFRESH_MS);
  }

})();

// ---- extracted script block ----

/* === Floor Price — fetches via your Cloudflare Worker /os/stats === */
(function(){
  const WORKER    = 'https://nft-live-listings.jvweb3.workers.dev';
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
    // jv: "add the chain symbol for each collection since the bot is
    // genuinely multi chain" -- while wiring that up, found this was
    // hardcoded to always show "ETH" regardless of the collection's
    // actual chain (LIVE_CHAIN, already set correctly elsewhere by
    // config.js on every collection switch) -- e.g. nekoadz (Robinhood
    // Chain) showed "ETH" here despite it being wrong.
    const chainEl = document.getElementById('mmetaChainVal');
    if(chainEl) chainEl.innerHTML = chainBadgeHtml(typeof LIVE_CHAIN !== 'undefined' ? LIVE_CHAIN : 'ethereum');
    if(items != null) setText('mmetaItemsVal', fmtNum(items));
    if(owners != null) setText('mmetaOwnersVal', fmtNum(owners));
  }

  async function fetchOwners(){
    try{
      // Reads LIVE_CONTRACT directly (not a captured local const) --
      // confirmed live this whole IIFE only ever runs once at initial page
      // load, then hands off to setInterval forever after. A captured
      // const would keep fetching whatever collection was active at THAT
      // moment, permanently, even after switching collections later --
      // reading the live global here means every tick (and any future
      // manual refresh) automatically reflects whichever collection is
      // actually active right now.
      const r = await fetch(`${WORKER}/nft/holders?contract=${LIVE_CONTRACT}&chain=${LIVE_CHAIN}`, { cache: 'force-cache' });
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      if(j?.ok){
        // jv: genuinely multi-collection now -- 10000 was an
        // OCAS-coincidental fallback, wrong for any other collection's
        // real supply (e.g. nekoadz's 134) if this specific field ever
        // comes back empty. TOKEN_COUNT is this collection's own known
        // supply, already used as the authoritative count everywhere
        // else in this app.
        updateMetaRow({ owners: j.unique_wallets, items: j.total_supply || (typeof TOKEN_COUNT !== 'undefined' ? TOKEN_COUNT : null) });
      }
    }catch(e){
      console.warn('[Header] owners fetch error:', e.message);
    }
  }

  async function fetchFloor(){
    try{
      // Same fix as fetchOwners() above -- LIVE_SLUG read directly, not a
      // captured local const.
      const r = await fetch(`${WORKER}/os/stats?slug=${LIVE_SLUG}`, { cache: 'no-store' });
      if(!r.ok) throw new Error('HTTP ' + r.status);
      const j = await r.json();
      const t = j?.total || j?.stats || j || {};

      const fp  = t.floor_price ?? j?.floor_price ?? null;
      const sym = t.floor_price_symbol ?? j?.floor_price_symbol ?? 'ETH';
      const floorPriceVal = fp;
      if(floorPriceVal != null) window._lastFloorEth = Number(floorPriceVal);
      // Exposed globally (was local to this fetch only) so other panels
      // needing this collection's real currency -- e.g. the Mispriced
      // panel's own price display, which had the exact same hardcoded
      // "Ξ" bug this fix already addresses for the floor pill itself --
      // can use the same real symbol instead of separately guessing at
      // their own fallback.
      window._liveCurrencySymbol = sym;

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
      // jv confirmed live on nekoadz (Robinhood Chain): floor showing
      // "12 ETH" when it should read "12 USDG". Two things going on here:
      // 1) this line itself hardcoded the "Ξ" glyph regardless of the
      //    actual symbol -- same bug class already fixed for sale
      //    currency display (getSaleCurrency() callers in the sales tab).
      //    Fixed the same way: only show it for an actual ETH/WETH symbol.
      // 2) `sym` resolved to the 'ETH' fallback at all, meaning OpenSea's
      //    /collections/{slug}/stats response didn't actually include a
      //    usable floor_price_symbol for this collection -- logging the
      //    raw stats object once so the real response shape is visible
      //    without guessing further.
      if(sym === 'ETH' && !window.__loggedFloorStatsShape){
        window.__loggedFloorStatsShape = true;
        console.log(`[fetchFloor] [${LIVE_SLUG}] floor_price_symbol missing/ETH -- raw stats response:`, JSON.stringify(j));
      }
      el.textContent = `${['ETH','WETH'].includes(sym) ? 'Ξ ' : ''}${formatted} ${sym}`;
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
        // jv: percentage was wildly wrong and inconsistent with OpenSea --
        // this cache key wasn't scoped by collection at all, so switching
        // collections within the 5-minute cache window compared the
        // CURRENT collection's real floor against a DIFFERENT collection's
        // stale ref_24h left over from before the switch (e.g. argonauts'
        // real ~0.575 ETH floor vs on-chain-all-stars' ~0.0039 ETH 24h-ago
        // floor produces exactly the absurd ~14,700% jv saw).
        const CACHE_KEY = `_floorHistory24hCache_${LIVE_SLUG}`;
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

  // jv: landing page loading slowly on a hotspot. Opening a collection
  // from the landing page is a full page load (?collection=slug), where
  // everything below starts fresh anyway -- so on the landing page this
  // was pure background traffic competing with the landing cards.
  // (refreshHeaderStats below is still defined either way.)
  if(!window.__TV_LANDING__){
    fetchFloor();
    fetchOwners();
    setInterval(fetchFloor, REFRESH);
    setInterval(fetchOwners, 300000);
  }
  // Confirmed live: jv reported header stats (floor, volume, sales, 24h,
  // owners) never actually switching over when changing collections --
  // this whole IIFE only ever runs its initial fetchFloor()/fetchOwners()
  // once, at page load, then relies purely on the setInterval timers above
  // for anything after that. Those timers use whatever LIVE_SLUG/
  // LIVE_CONTRACT happen to be AT THE MOMENT EACH TICK FIRES (fixed above,
  // previously captured once and frozen forever) -- but that could still
  // mean up to a full REFRESH interval (2 minutes) of stale data showing
  // after a switch, before the next natural tick catches up. Exposing this
  // so switchCollection()/_applyCollectionSwitch() in config.js can call
  // it directly, refreshing the header immediately on switch rather than
  // waiting for it.
  window.refreshHeaderStats = () => { fetchFloor(); fetchOwners(); };
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
    grid.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:10px 0">No listed tokens found.</div>';
    if(badge) badge.textContent = '0';
    return;
  }

  // jv confirmed live: no images at all for Mispriced on Argonauts. Traced
  // to a real bug, not a timing issue -- this panel was reading straight
  // from IMAGES_MAP, which only ever gets populated for OCAS (loadImagesMap()
  // is explicitly OCAS-only, see init()); every other collection's images
  // live in the DB instead. The fallback right below it, imgForId(), isn't
  // even a real function anywhere in this codebase -- the typeof guard just
  // silently no-ops. So this panel could never show an image for any
  // non-OCAS collection, regardless of timing. Fixed by using
  // _getTokenImgSrcAsync() (same collision-safe, per-collection lookup
  // chain the main grid, hover tooltips, and everything else already use
  // correctly) per-card below instead -- which also means the wait loop
  // that used to sit here is no longer needed: each card now resolves its
  // own image independently, correctly, for whichever collection is live.

  // Score each listed token: price / rarity_score
  // rarity_score = 1/rank  (rank 1 = rarest = highest value)
  // value_score = price_eth * rank  →  low price * low rank number = best deal
  const rankMap = (typeof RARITY_MODE !== 'undefined' && RARITY_MODE === 'theoretical' && typeof RARITY_THEO_RANK !== 'undefined' && RARITY_THEO_RANK.size)
    ? RARITY_THEO_RANK : (typeof RARITY_OBS_RANK !== 'undefined' ? RARITY_OBS_RANK : new Map());

  const mode = window.MISPRICED_MODE || 'rarity';
  const floorEl = document.getElementById('floorPillValue');
  const floorText = floorEl ? floorEl.textContent.replace(/[^0-9.]/g,'') : '0';
  const floorPrice = parseFloat(floorText) || 0;

  // jv: "Best Value" called a 69 ETH listing the best deal in the whole
  // collection, because its old formula (price * (rank/10000)) rewards
  // ANY price on a top-ranked token -- a tiny rank divisor crushes the
  // score toward zero regardless of how high the price actually is, so a
  // rank #3 token at 69 ETH scored lower (= "better") than a rank #8000
  // token at 0.5 ETH. That's measuring rarity, not mispricing.
  //
  // A real mispriced/best-deal signal has to compare a token's actual
  // price against what similarly-ranked tokens are actually asking --
  // exactly what the Price vs Rank scatter chart's own trend line
  // already does (renderScatter() / fitRankPriceTrend() above). Reusing
  // that same model and threshold here instead of a separate,
  // inconsistent definition of "good deal".
  let trendModel = null;
  {
    const trendPts = [];
    for(const id of listedIds){
      const r = rankMap.get(id);
      const p = (typeof getListingEth === 'function') ? getListingEth(id) : (window.LISTINGS?.[id]?.opensea?.price_eth ?? null);
      if(r == null || p == null) continue;
      trendPts.push({ rank: r, price: +p });
    }
    trendModel = fitRankPriceTrend(trendPts);
  }

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
      // Best Value: how far below the rank/price trend line this token's
      // actual price sits -- negative = underpriced relative to what
      // similarly-ranked tokens are asking (a real deal), positive =
      // priced above trend (not a deal, regardless of how rare it is).
      // Falls back to the old rank-weighted approximation only when the
      // trend line itself couldn't be fit (too few live listings).
      if(trendModel && price_eth != null){
        const expected = Math.max(0, trendModel.predict(rank));
        score = expected > 0 ? (price_eth - expected) / expected : Infinity;
      } else {
        score = price_eth != null ? (price_eth * (rank / 10000)) : Infinity;
      }
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
  const cards = await Promise.all(top.map(x => buildMispricedCardHtml(x, scored, mode)));

  grid.innerHTML = cards.join('');
  // Store all scored for filter/sort re-use
  if(typeof _mispricedAllScored !== 'undefined') _mispricedAllScored = scored;
  window._mispricedMode = mode;
  // Populate summary row after render
  if(typeof applyMispricedFilters === 'function') applyMispricedFilters();
  if(typeof window._reattachHovers === 'function') window._reattachHovers();
}

// Extracted from buildMispricedPanel() so applyMispricedFilters() (below)
// can build a card for any token that a different sort/filter brings into
// view but that wasn't part of the very first top-50-by-value pass --
// same reasoning documented on applyMispricedFilters() itself.
async function buildMispricedCardHtml({id, price_eth, rank, score, url, traitInsight}, scored, mode){
  let imgHtml = '<div style="color:var(--sub);font-size:10px">…</div>';
  try{
    const src = await _getTokenImgSrcAsync(id);
    if(src){
      const s = String(src).trim();
      if(s.startsWith('<svg')) imgHtml = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">${_svgCrisp(s)}</div>`;
      else imgHtml = `<img src="${(typeof ipfsToHttp==='function'?ipfsToHttp(s):s)}" alt="#${id}" loading="lazy" style="width:100%;height:100%;object-fit:contain">`;
    }
  }catch(e){}

  // jv: "the listings for nekoadz arent showing[,] 0 Eth and it should
  // be showing a price in USDG." The hardcoded "Ξ" below was wrong
  // regardless of the number itself -- same bug already fixed for the
  // floor pill (fetchFloor() above), fixed the same way: only show the
  // ETH glyph for an actual ETH/WETH symbol, using the real one this
  // collection reports rather than assuming ETH for every collection.
  const currencySym = window._liveCurrencySymbol || 'ETH';
  const ethFmt   = price_eth >= 1 ? price_eth.toFixed(3) : price_eth.toFixed(4);
  // Score label: top 10% = "🔥 Hot Deal", rest = value score
  const topIdx   = Math.max(0, Math.floor(scored.length * 0.1) - 1);
  const hotThreshold = scored[topIdx]?.score ?? 0;
  // For "Best Value" specifically, score is now (price - expected) /
  // expected relative to the rank/price trend line -- being in the top
  // 10% of THIS listing set isn't enough on its own to call something a
  // deal if every current listing happens to be overpriced; also
  // requires an actual discount vs trend (same -7% "Undervalued"
  // threshold the Price vs Rank chart itself uses), so "Best Deal"
  // never gets stamped on a token that's merely the least-overpriced
  // one currently listed.
  const isHot    = mode === 'rarity' ? (score <= hotThreshold && score <= -0.07) : (score <= hotThreshold);
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
        <span class="mispriced-price">${['ETH','WETH'].includes(currencySym) ? `Ξ ${ethFmt}` : `${ethFmt} ${currencySym}`}</span>
      </div>
      <span class="${scoreClass}">${scoreTxt}</span>
      ${traitsSection}
      ${url ? `<a class="mp-opensea" href="${url}" target="_blank" rel="noopener" onclick="event.stopPropagation()">OpenSea ↗</a>` : ''}
    </div>
  </div>`;
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
        const _simPgs = priceGlyphAndSuffix(window.LISTINGS?.[t.id]?.opensea?.currency);
        const _simIsWeth = (window.LISTINGS?.[t.id]?.opensea?.currency||'ETH').toUpperCase()==='WETH';
        return `<div onclick="openModal(${t.id})" style="cursor:pointer;border-radius:7px;overflow:hidden;border:1px solid color-mix(in srgb, var(--text) 10%, transparent);background:var(--soft)">
          <div style="position:relative;padding-bottom:100%">${imgTag}</div>
          <div style="padding:3px 4px;font-size:9px">
            <div style="font-weight:700;color:var(--text)">#${t.id}</div>
            <div style="color:${_simIsWeth?'#f87171':'#2dd4bf'};font-weight:700">${_simPgs.glyph}${t.price.toFixed(4)}${_simPgs.suffix}</div>
            <div>${displayRankHtml(t.id, "font-size:9px;font-weight:700;")}</div>
          </div>
        </div>`;
      }).join('')}
      ${similar.length > 24 ? `<div style="display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--sub);padding:8px">+${similar.length-24} more</div>` : ''}
    </div>`;
}


/* ── Wallet View ─────────────────────────────────────────────────── */
(function(){
  // Sidebar Wallet View panel was removed from index.html (moved to the
  // header wallet drawer). This whole IIFE is now dead without it — guard
  // instead of leaving null-reference errors on the elements below.
  if(!document.getElementById('walletLookupBtn')) return;
  const WORKER   = window.LIVE_ENDPOINT || 'https://nft-live-listings.jvweb3.workers.dev';
  const CONTRACT = LIVE_CONTRACT;
  const OS_SLUG  = LIVE_SLUG; // confirmed live: was hardcoded to OCAS's slug -- same fix as the two other independent IIFEs above.

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
      const alchemyUrl = `${WORKER}/nft/wallet?address=${encodeURIComponent(addr)}&contract=${encodeURIComponent(CONTRACT)}&chain=${encodeURIComponent(LIVE_CHAIN)}`;
      const alchemyR = await fetch(alchemyUrl, { cache: 'no-store' });
      const alchemyJ = alchemyR.ok ? await alchemyR.json() : null;

      let tokenIds = [];
      if(alchemyJ?.ok && alchemyJ.tokenIds?.length){
        tokenIds = alchemyJ.tokenIds;
      } else {
        // Fallback: paginate OpenSea (up to 3 pages = 600 tokens)
        let allNfts = [], cursor = null;
        for(let page = 0; page < 3; page++){
          const qs = new URLSearchParams({ address: addr, slug: OS_SLUG, contract: CONTRACT, chain: LIVE_CHAIN });
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
        status.textContent = `No ${(typeof COLLECTIONS !== 'undefined' && COLLECTIONS[LIVE_SLUG]?.name) || 'tokens'} in this wallet right now.`;
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
        const mapVal = (LIVE_SLUG === 'on-chain-all-stars') ? (IMAGES_MAP && IMAGES_MAP.get(t.id)) : null;
        let imgHtml = '<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--sub);font-size:10px">…</div>';
        if(mapVal){
          const s = String(mapVal).trim();
          if(s.startsWith('<svg')){
            try{ imgHtml = `<img src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(_svgCrisp(s))}" alt="#${t.id}" loading="lazy" style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated">`; }catch{}
          } else if(/^data:image\//i.test(s)){
            imgHtml = `<img src="${s}" alt="#${t.id}" loading="lazy" style="width:100%;height:100%;object-fit:contain;image-rendering:pixelated">`;
          }
        }
        const rankHtml = `<div class="wallet-rank">${displayRankHtml(t.id, "font-size:10px;font-weight:700;")}</div>`;
        const _walletPgs = priceGlyphAndSuffix(window.LISTINGS?.[t.id]?.opensea?.currency);
        const listingIsWeth = (window.LISTINGS?.[t.id]?.opensea?.currency||'ETH').toUpperCase() === 'WETH';
        const priceHtml = (window.LISTINGS && window.LISTINGS[t.id]?.opensea?.price_eth != null)
          ? `<div style="font-size:9px;color:${listingIsWeth?'#f87171':'#2dd4bf'};font-weight:700">${_walletPgs.glyph}${window.LISTINGS[t.id].opensea.price_eth.toFixed(4)}${_walletPgs.suffix}</div>` : '';
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
        const _lowestPgs = priceGlyphAndSuffix(window.LISTINGS[lowest.id].opensea.currency);
        status.textContent = `${listed.length} listed • Lowest: ${_lowestPgs.glyph}${window.LISTINGS[lowest.id].opensea.price_eth.toFixed(4)}${_lowestPgs.suffix}`;
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
  // Ground-truth survivor image (burn_state_snapshots) beats everything else --
  // OpenSea's own indexing can lag behind the real on-chain state, so prefer
  // our own confirmed-accurate data over the live OpenSea fetch below.
  const survivorImg = window.SURVIVOR_IMAGE_MAP && window.SURVIVOR_IMAGE_MAP.get(id);
  if(survivorImg) return survivorImg;
  // Check session-cached fresh image first (fetched from OpenSea, overrides stale chunk)
  const fresh = _getFreshImg(id);
  if(fresh) return fresh;
  // Confirmed live: for any collection other than OCAS, IMAGES_MAP is
  // always empty (it's only ever populated from OCAS's own static
  // ./data/token_images*.json files -- there's no equivalent static file
  // for any other collection, since their images live in the live DB
  // instead). Falling straight through to imgForId() below built a path
  // like ./data/images/{id}.png, which is ALWAYS an OCAS file keyed purely
  // by numeric token ID with zero collection awareness -- silently showing
  // OCAS's own token #2817 for a completely different collection's token
  // #2817 whenever the numbers happened to coincide, exactly the same
  // cross-collection collision bug class already hit once before elsewhere
  // in this app. The live DB response (/db/all-traits, fetched in init())
  // already includes each token's own image and gets pre-warmed directly
  // into CHUNK_CACHE -- check that first, before ever reaching the
  // OCAS-only static fallbacks.
  const chunk = CHUNK_CACHE.get(chunkIndexFor(id));
  const dbImg = chunk && chunk[String(id)] && chunk[String(id)].image;
  // jv: "The backgrounds be still have those lines in them." Traced this
  // to the actual, previously-missed root cause: this is the central
  // function nearly every display location ultimately calls to resolve
  // a token's image, and dbImg (the live-DB image field -- exactly how
  // Argonauts, and every non-OCAS collection, get their images) was
  // being converted straight to a data URI with no _svgCrisp() applied
  // at all. By the time that string reached any of the 8 display
  // locations fixed last round, it was already a data:image/svg+xml,...
  // URI, not raw <svg...> text -- so none of those startsWith('<svg')
  // checks ever even triggered for this specific, very common path.
  if(dbImg) return String(dbImg).startsWith('<svg')
    ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(_svgCrisp(dbImg))
    : dbImg;
  // Everything below this point is OCAS's own static-file system --
  // correct only for OCAS itself, never a valid source for any other
  // collection.
  if(LIVE_SLUG !== 'on-chain-all-stars') return null;
  const mapVal = IMAGES_MAP && IMAGES_MAP.get(id);
  // jv confirmed live: imgForId() isn't a real function anywhere in this
  // codebase (same latent bug fixed at every other call site this
  // session) -- calling it unguarded here specifically risked breaking
  // this function's own OCAS fallback, the very function used everywhere
  // else as THE fix. Nothing meaningful to fall back to if mapVal itself
  // is empty, so this just returns null cleanly instead of throwing.
  const src = mapVal || null;
  if(!src) return null;
  const s = String(src).trim();
  if(s.startsWith('<svg')){
    try{ return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(_svgCrisp(s)); }catch{ return null; }
  }
  if(/^data:image\//i.test(s)) return s;
  return src;
}

// jv: "for the hover tool tip showing token images on the graphs... I was
// in desktop when I noticed they weren't being displayed." The Floor
// Trend and Price vs Rank charts can reference a token whose chunk hasn't
// actually finished pre-warming into CHUNK_CACHE yet -- that pre-warming
// happens via a single /db/all-traits fetch in init() that all of
// CHUNK_CACHE depends on, but there's no guarantee a user won't switch to
// one of these chart tabs and hover a dot before that fetch resolves,
// especially right after a page load or collection switch (the exact
// window this was actually seen in). The synchronous _getTokenImgSrc()
// above has no way to wait for data that simply isn't there yet -- it
// just returns null, and the tooltip renders with no image at all.
//
// IMPORTANT: ensureChunk() fetches chunkUrlByIndex()'s path, which is
// always one of OCAS's own local static /data/chunks/ files -- it is NOT
// collection-aware at all. Calling it for a non-OCAS collection would
// silently fetch OCAS's own unrelated chunk data for that index, exactly
// the cross-collection collision bug class already hit and fixed several
// times elsewhere in this app -- caught this myself before it shipped.
// So the two collection cases need genuinely different waits: OCAS's
// CHUNK_CACHE is legitimately backed by these same static per-chunk
// files, so ensureChunk() is a correct, safe, collection-specific retry
// for it. Every other collection's CHUNK_CACHE is instead populated
// entirely from the one single, bulk /db/all-traits fetch in init() --
// there's no equivalent per-chunk endpoint to retry against at all, so
// the only real thing to wait for is that same fetch, exposed globally as
// window._allTraitsPromise specifically so this can await it.
// jv: "'Highlighted' in the address pill doesn't need to be there.
// Just the address and or the .eth address if available." Reuses the
// existing /tv/identity endpoint (ENS name + linked X account,
// DB-cached server-side, so most lookups are a single cheap read
// rather than a live external call every time). Cached client-side
// too, per address, for the life of this page load -- a wallet's ENS
// name essentially never changes mid-session, so there's no reason to
// look the same one up twice.
const _walletNameCache = new Map(); // address (lowercase) -> ENS name, or null if resolved with none
async function _getWalletDisplayNameAsync(address){
  const lower = (address||'').toLowerCase();
  if(_walletNameCache.has(lower)) return _walletNameCache.get(lower);
  try{
    const j = await dbFetch('/tv/identity', { address: lower });
    const name = (j?.ok && j.name) ? j.name : null;
    _walletNameCache.set(lower, name);
    return name;
  }catch(e){
    _walletNameCache.set(lower, null);
    return null;
  }
}

async function _getTokenImgSrcAsync(id){
  const immediate = _getTokenImgSrc(id);
  if(immediate) return immediate;
  try{
    if(LIVE_SLUG === 'on-chain-all-stars'){
      await ensureChunk(chunkIndexFor(id));
    } else if(window._allTraitsPromise){
      await window._allTraitsPromise;
    } else {
      return null;
    }
  }catch{ return null; }
  return _getTokenImgSrc(id);
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
    // Confirmed live: same bug class as VS._nodeCache, fixed earlier this
    // session -- this sessionStorage key was scoped by token id alone, with
    // zero collection awareness. A token viewed on one collection earlier
    // in the browser session leaves its image URL cached under a key that
    // an identically-numbered token on a different collection would read
    // right back, silently overwriting the correct image the modal had
    // already displayed a moment earlier via row.image.
    const raw = sessionStorage.getItem(`${_IMG_CACHE_KEY}:${LIVE_SLUG}:${id}`);
    if(!raw) return null;
    const {url, ts} = JSON.parse(raw);
    if(Date.now() - ts > _IMG_TTL){ sessionStorage.removeItem(`${_IMG_CACHE_KEY}:${LIVE_SLUG}:${id}`); return null; }
    return url;
  }catch{ return null; }
}

function _storeFreshImg(id, url){
  try{ sessionStorage.setItem(`${_IMG_CACHE_KEY}:${LIVE_SLUG}:${id}`, JSON.stringify({url, ts: Date.now()})); }catch{}
}

async function _fetchFreshImg(id){
  if(_imgRefreshSet.has(id)) return;
  _imgRefreshSet.add(id);
  try{
    const CONTRACT = LIVE_CONTRACT; // confirmed live: was hardcoded to OCAS's own contract -- same bug class as the other IIFEs fixed above, this one would have fetched OCAS's own token image regardless of the active collection.
    // Route through Worker — avoids CORS, uses server-side API key, no rate limit risk
    // nocache=1 bypasses the Worker's 6hr cache so we always get the latest image
    const wr = await fetch(`${LIVE_ENDPOINT}/os/nft?contract=${CONTRACT}&tokenId=${id}&chain=${LIVE_CHAIN}&nocache=1`);
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
// ── OCAS image refresh helpers ─────────────────────────────────────────
// The 5-min refresh below compares the bot's image for each token with
// what's shown. OCAS tiles now show per-token static files
// (data/img/<id>.svg), so a string compare would call EVERY token
// "changed". A sampled fingerprint of the SVG text (same algorithm the
// generator used for data/img/hashes.json) tells whether the art really
// changed (burns/evolutions) without hashing 40 MB every refresh.
let _ocasImgFp = null, _ocasImgFpP = null;
function _svgFp(s){
  const n = s.length, step = Math.max(1, Math.floor(n / 256));
  let h = 0x811c9dc5;
  for(const ch of String(n)){ h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  for(let i = 0; i < n; i += step){ h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
function _svgTextOf(v){
  const s = String(v || '').trim();
  if(s.startsWith('<svg')) return s;
  if(/^data:image\/svg\+xml;base64,/i.test(s)){ try{ return new TextDecoder().decode(Uint8Array.from(atob(s.slice(s.indexOf(',') + 1)), c => c.charCodeAt(0))); }catch(_){ return null; } }
  if(/^data:image\/svg\+xml/i.test(s)){ try{ return decodeURIComponent(s.slice(s.indexOf(',') + 1)); }catch(_){ return null; } }
  return null;
}
// What an <img> can actually display. Raw '<svg...' text is NOT a valid img
// src -- the old refresh assigned it directly, turning live tiles into
// broken '?' images (jv: OCAS images that "don't load fully").
function _imgDisplaySrc(v){
  const s = String(v || '').trim();
  if(s.startsWith('<svg')){ try{ return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(_svgCrisp(s)); }catch(_){ return ''; } }
  return s.startsWith('data:') ? s : ipfsToHttp(s);
}

async function refreshLiveTokenData(){
  try{
    const j = await dbFetch('/db/all-traits');
    if(!j?.ok || !j.tokens) return;
    if(LIVE_SLUG === 'on-chain-all-stars' && !_ocasImgFp){
      _ocasImgFpP = _ocasImgFpP || fetch(`${DATA_DIR}/img/hashes.json`).then(r => r.ok ? r.json() : {}).catch(() => ({}));
      _ocasImgFp = await _ocasImgFpP;
    }
    for(const [idStr, data] of Object.entries(j.tokens)){
      const id = parseInt(idStr);
      if(!Number.isFinite(id)) continue;

      // Image: only touch it if the DB actually has a fresher one on file
      // (most tokens will be null here until they go through a burn).
      if(data.image){
        const current = String(IMAGES_MAP?.get(id) || '').trim();
        let changed = data.image !== current;
        // Showing the static per-token file: only a real art change counts.
        if(changed && /\/data\/img\/\d+\.svg$/.test(current) && _ocasImgFp && _ocasImgFp[id]){
          const txt = _svgTextOf(data.image);
          if(txt && _svgFp(txt) === _ocasImgFp[id]) changed = false;
        }
        if(changed){
          IMAGES_MAP?.set(id, data.image);
          const _disp = _imgDisplaySrc(data.image);
          document.querySelectorAll(`[data-id="${id}"] img, [data-burn-token-id="${id}"]:not([data-burn-frozen-img]) img`).forEach(img => { if(_disp) img.src = _disp; });
          const _h1 = window._modalBurnHistory;
          const _atLatest1 = !_h1 || _h1.tokenId !== id || _h1.index === _h1.entries.length - 1;
          if(window._modalCurrentId === id && _atLatest1){
            const imgBox = document.getElementById('mImg');
            if(imgBox){
              const s = String(data.image).trim();
              if(s.startsWith('<svg')) imgBox.innerHTML = `<div class="svg-wrap" style="width:100%;height:100%">${_svgCrisp(s)}</div>`;
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
            if(mTraits) mTraits.innerHTML = kv.length ? kv.map(([k,v])=>`<div><span>${traitDisplayLabel(k)}</span><b>${v}</b></div>`).join('') : '<div style="color:var(--sub)">No traits</div>';
          }
        }
      }
    }
  }catch(e){ console.warn('[LiveRefresh]', e.message); }
}
// (skipped on the landing page -- no collection loaded there; see the
// landing-page notes on the Sales/Floor boots above)
if(!window.__TV_LANDING__) setTimeout(() => {
  refreshLiveTokenData();
  setInterval(refreshLiveTokenData, LIVE_REFRESH_MS);
}, 30_000); // wait 30s after script load so this never competes with initial page render

// Global data store for holder thumbnail tooltips
window._holderThumbs = {};

function _holderThumbEnter(id, clientX, clientY){
  const d = window._holderThumbs[id];
  if(!d) return;
  const imgH = d.img ? `<img src="${d.img}" style="width:56px;height:56px;object-fit:contain;image-rendering:pixelated;border-radius:5px;display:block;margin-bottom:6px">` : '';
  const _thumbPgs = priceGlyphAndSuffix(window.LISTINGS?.[id]?.opensea?.currency);
  const _thumbIsWeth = (window.LISTINGS?.[id]?.opensea?.currency||'ETH').toUpperCase()==='WETH';
  _showChartTooltip('_holderThumbTT', clientX, clientY,
    imgH +
    `<div style="font-weight:700;font-size:12px;margin-bottom:2px">#${id}</div>` +
    `<div style="font-size:10px;margin-bottom:4px">${rankDiamondHtml(d.rank || '', '', d.rankSys)}</div>` +
    (d.price != null ? `<div style="color:${_thumbIsWeth?'#f87171':'#2dd4bf'};font-weight:700;font-size:13px">${_thumbPgs.glyph}${d.price}${_thumbPgs.suffix}</div>` : '') +
    `<div style="color:#7a8fa8;font-size:10px;margin-top:5px">Click to open token</div>`
  );
}

function _showChartTooltip(tooltipId, x, y, html, bypassMobileCheck){
  // Never draw a chart tooltip over an open token modal (see openModal).
  { const _m = document.getElementById('modal'); if(_m && _m.style.display && _m.style.display !== 'none') return; }
  // jv: "When going to full screen in desktop the hover tooltip over
  // the dots is still not working." This check was ever meant to
  // filter out stray/ghost hover events on a touchscreen (no real
  // mouse to "hover" with), using window._tvIsPhone() as a proxy
  // for "this is probably a touch device." That proxy is wrong for a
  // real desktop user whose browser window (or, per an earlier fix,
  // apparently still narrower than expected even with the real
  // Fullscreen API engaged on some setups) happens to be under 900px
  // wide -- a completely legitimate mouse-hover situation was getting
  // silently suppressed by a width threshold that has nothing to do
  // with whether a mouse is actually present. Checks actual hover
  // capability instead (matches the CSS media feature browsers use for
  // the same purpose) -- true on any real mouse/trackpad device
  // regardless of window width, false on touch-only devices regardless
  // of width, which is what this was always trying to detect in the
  // first place.
  const canHover = typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches;
  if(!bypassMobileCheck && !canHover) return; // No hover tooltips on touch-only devices
  let tt = document.getElementById(tooltipId);
  if(!tt){ tt = document.createElement('div'); tt.id = tooltipId; }
  // jv: "On desktop when switching to full screen the hover display over
  // the dots doesn't work. I think because full screen is separate from
  // the website." Exactly that: desktop fullscreen uses the browser's
  // Fullscreen API, which renders ONLY the fullscreen element and its
  // descendants. The tooltip lived on document.body -- outside the
  // overlay -- so it was created and positioned fine but never drawn.
  // Re-parent it into whatever is fullscreen right now, and back to
  // body otherwise (mobile's CSS-only fullscreen never sets a
  // fullscreenElement, so it's unaffected). Shared by every chart's
  // tooltip, so Sale Chart, Floor Trend and deep-dive are all covered.
  const _ttParent = document.fullscreenElement || document.webkitFullscreenElement || document.body;
  if(tt.parentNode !== _ttParent) _ttParent.appendChild(tt);
  // jv: "in the minimal light them the text inside the hover tool tip
  // is black and hard to read." This was hardcoded to a dark navy
  // background with light text regardless of theme -- on a dark theme
  // that's invisible as a bug, but content built by the various
  // tooltip-building functions (rank badges, trait labels, etc.) uses
  // var(--text)/var(--sub), which on the Minimal Light theme means
  // dark text, landing on this same hardcoded dark background -- dark
  // text on a dark background. Theme-aware colors here instead, so the
  // tooltip's own background always matches whatever text color its
  // content actually uses.
  // jv: "When I moved from full screen back to portrait view I seen a
  // small thumbnail of a token popped up... but it's not displaying in
  // the full screen mode for some reason." This tooltip's z-index (9500)
  // was lower than the fullscreen chart overlay's own (9999) -- it was
  // still being created and shown every time, just rendering BEHIND the
  // overlay's opaque content, invisible. Raised above every z-index
  // already in use anywhere in the app so this can never happen again
  // regardless of what overlay is open.
  tt.style.cssText = 'position:fixed;z-index:10500;pointer-events:none;display:block;' +
    // jv: "The hover display being black is kind of a [no] contrast
    // with the background also being black... make those hover tool
    // display a black frosted glass look?? Is that possible? So you
    // can still see some of the chart through it." backdrop-filter:blur
    // was already here, but var(--panel) is a fully opaque color on
    // every theme -- blur only affects what's visible THROUGH an
    // element, so an opaque background gave it nothing to actually
    // show. color-mix blends the theme's own panel color with
    // transparent (still fully theme-aware -- dark themes get a dark
    // glass, the light theme gets a light one, matching whichever
    // panel color that theme already uses) rather than a background
    // that finally has something for the existing blur to blur.
    // jv: "Drop the tool tips [transparency]." The chart's own dots
    // and connection lines were made more visible just before this
    // (to stop them blending into the light theme) -- since the
    // tooltip sits on top of the chart, that bolder content showing
    // through made the tooltip itself read as less transparent even
    // though its own value hadn't moved. Dropped further to
    // compensate (10% -> 5%).
    'background:color-mix(in srgb, var(--panel) 5%, transparent);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);' +
    'border:1px solid var(--border, color-mix(in srgb, var(--text) 10%, transparent));border-radius:12px;padding:10px 12px;' +
    'box-shadow:0 8px 28px rgba(0,0,0,.35);font-size:12px;color:var(--text);max-width:220px;min-width:160px;';
  tt.innerHTML = html;
  // jv: "The hover token display runs off the bottom of the page and
  // some info is hidden." tw/th below used to be hardcoded estimates
  // (220x180) for the bounds check -- too small for this tooltip's
  // actual content (image + rank + price + trait match + wallet note
  // + anchor tag + timestamp + the tap-instruction line can genuinely
  // run taller than 180px), so the check thought there was room when
  // there wasn't and let it run off the bottom uncorrected. Measuring
  // the element's own real rendered size instead -- it's already in
  // the DOM with its content set at this point, just not positioned
  // yet, which doesn't affect its own intrinsic width/height.
  const vw = window.innerWidth, vh = window.innerHeight;
  const tw = tt.offsetWidth || 220, th = tt.offsetHeight || 180;
  let lx = x + 14, ly = y - 10;
  if(lx + tw > vw) lx = x - tw - 10;
  if(ly + th > vh) ly = vh - th - 10;
  if(ly < 0) ly = 4; // taller than the viewport itself -- pin to the top rather than letting it go negative
  tt.style.left = lx + 'px';
  tt.style.top  = ly + 'px';
}

function _hideChartTooltip(tooltipId){
  const tt = document.getElementById(tooltipId);
  if(tt) tt.style.display = 'none';
}

// jv: linear price-vs-rank trend called a rank #9768 (near-bottom,
// common) token priced barely above floor a "Best Deal" -- a straight
// line fit across the whole rank range gets pulled around by the
// handful of genuinely expensive rare listings, which systematically
// over-predicts the "expected" price for common tokens, making anything
// near floor look artificially underpriced. NFT price-vs-rank curves are
// much closer to exponential decay (a steep premium for the rarest few,
// flattening out near floor for the bulk) -- fitting in log-price space
// instead (price ≈ exp(intercept + slope·rank)) matches that shape, and
// matches the Price vs Rank chart's own y-axis already being log-scaled.
// Shared by renderScatter() and buildMispricedPanel() so both use the
// same definition of "expected price for this rank". Returns null when
// there isn't enough real listing data to fit anything meaningful.
function fitRankPriceTrend(pts){
  const valid = pts.filter(p => p.price > 0);
  if(valid.length < 8) return null;
  const n = valid.length;
  const sumX = valid.reduce((s,p)=>s+p.rank,0);
  const sumY = valid.reduce((s,p)=>s+Math.log(p.price),0);
  const sumXY = valid.reduce((s,p)=>s+p.rank*Math.log(p.price),0);
  const sumX2 = valid.reduce((s,p)=>s+p.rank*p.rank,0);
  const denom = (n*sumX2 - sumX*sumX);
  if(denom === 0) return null;
  const slope = (n*sumXY - sumX*sumY) / denom;
  const intercept = (sumY - slope*sumX) / n;
  return { slope, intercept, predict(rank){ return Math.exp(slope*rank + intercept); } };
}

function renderScatter(){
  const host = document.getElementById('scatterHost');
  const countEl = document.getElementById('scatterCount');
  if(!host) return;
  // Plotly loads in the background now (see index.html); wait for it.
  if(typeof Plotly === 'undefined'){ window.ensurePlotly && window.ensurePlotly(); setTimeout(renderScatter, 80); return; }

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

  // jv: axis was always auto-scaling to whatever the single highest-priced
  // listing happened to be (a rare troll/joke listing at an absurd price is
  // a common, real occurrence on OpenSea -- someone effectively delists
  // without actually delisting), stretching the whole chart to
  // accommodate one outlier and making every other point look crushed
  // together at the bottom. Median-based cap instead of a percentile --
  // verified a percentile approach doesn't actually work for realistic
  // listing counts (with only ~10-20 points, the 95th-percentile INDEX
  // rounds up to the outlier itself, so it never actually gets excluded).
  // Median is inherently outlier-resistant regardless of sample size.
  // Caps at min(actual max, median × 8) -- confirmed this correctly
  // reduces to the genuine max price when there's no real outlier at all
  // (e.g. jv's own example: highest real listing is 10 ETH -> axis caps at
  // exactly 10, not stretched further), while still capping a genuine
  // 1000x-median troll listing down to a readable range. The point itself
  // always still plots -- this only controls the visible axis range, not
  // which points get included.
  const sortedPrices = pts.map(p => p.price).sort((a,b) => a-b);
  const medianPrice = sortedPrices.length % 2 !== 0
    ? sortedPrices[Math.floor(sortedPrices.length / 2)]
    : (sortedPrices[sortedPrices.length / 2 - 1] + sortedPrices[sortedPrices.length / 2]) / 2;
  const priceCeiling = Math.min(sortedPrices[sortedPrices.length - 1], medianPrice * 8);
  const priceFloor = Math.max(sortedPrices[0] * 0.7, 0.0001); // guards against log10(0) = -Infinity if the lowest listing is ever priced at 0

  pts.sort((a,b) => a.rank - b.rank);
  countEl.textContent = pts.length + ' listings';

  // Trend line (see fitRankPriceTrend() above for why this is fit in
  // log-price space rather than a plain straight line)
  const trendModel = fitRankPriceTrend(pts);

  const minRank = pts[0].rank, maxRank = pts[pts.length-1].rank;
  const trendX = [minRank, maxRank];
  const trendY = trendModel ? trendX.map(x => Math.max(0, trendModel.predict(x))) : trendX.map(() => 0);

  // Jitter Y slightly to reduce overplotting on flat floor
  const jitter = pts.map(p => {
    const expected = trendModel ? trendModel.predict(p.rank) : Infinity;
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
    xaxis: {title:'Rank', color:subColor, gridcolor:_themeGrid(), zeroline:false},
    yaxis: {title:'Price (ETH)', color:subColor, gridcolor:_themeGrid(),
            zeroline:false, tickformat:'.4f',
            // Log scale helps spread out the congested bottom. Explicit
            // range (log10 of the actual ETH bounds -- Plotly's log-axis
            // range is specified in log10 space, not raw values) caps the
            // chart to a robust percentile of real listing prices instead
            // of auto-scaling to whatever the single highest-priced
            // listing happens to be -- see priceCeiling/priceFloor above.
            type:'log', range:[Math.log10(priceFloor), Math.log10(priceCeiling)]},
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

  // jv: "switching the time frame, it lags and lags the whole analytics
  // tabs" turned out to be the same listener-accumulation bug on
  // renderFloorTrend() below despite removeAllListeners() being real,
  // documented Plotly.js API -- something about it still wasn't
  // preventing accumulation in practice when paired with repeated
  // newPlot()/react() calls on the same div. Applying the same
  // structurally-can't-leak fix here: bind the hover/click/unhover
  // handlers to this host EXACTLY ONCE ever (guarded by
  // host._scatterListenersBound) instead of re-attaching (and trying to
  // first clear) them on every render.
  if(host._scatterListenersBound) return;
  host._scatterListenersBound = true;

  // Custom frosted-glass hover tooltip
  function _scatterTooltipHtml(cd, img, isTap){
    const imgHtml = img
      ? `<img src="${img}" style="width:64px;height:64px;object-fit:contain;border-radius:6px;image-rendering:pixelated;display:block;margin-bottom:8px">`
      : '';
    const label = cd.under
      ? '<span style="color:#2dd4bf;font-size:10px;font-weight:700">● UNDERVALUED</span>'
      : '<span style="color:rgba(140,160,200,.8);font-size:10px">● At trend</span>';
    const _scatterPgs = priceGlyphAndSuffix(window.LISTINGS?.[cd.id]?.opensea?.currency);
    const _scatterIsWeth = (window.LISTINGS?.[cd.id]?.opensea?.currency||'ETH').toUpperCase()==='WETH';
    return `${imgHtml}
      <div style="font-weight:700;font-size:13px;margin-bottom:2px">#${cd.id}</div>
      <div style="font-size:11px;margin-bottom:4px">${rankDiamondHtml(cd.rank, "font-weight:700;")}</div>
      <div style="font-size:14px;font-weight:700;color:${_scatterIsWeth?'#f87171':'#2dd4bf'};margin-bottom:4px">${_scatterPgs.glyph}${cd.price.toFixed(4)}${_scatterPgs.suffix}</div>
      ${label}
      <div style="color:#7a8fa8;font-size:10px;margin-top:6px">${isTap ? 'Tap again to open token' : 'Click to open token'}</div>`;
  }
  host.on('plotly_hover', data => {
    const pt  = data.points[0];
    const cd  = pt.customdata;
    if(!cd || !cd.id) return; // trend line has no customdata
    const ev  = data.event;
    host._scatterHoverId = cd.id;
    _showChartTooltip('_scatterTT', ev.clientX, ev.clientY, _scatterTooltipHtml(cd, _getTokenImgSrc(cd.id)));
    // jv: "I was in desktop when I noticed they weren't being displayed."
    // The synchronous lookup above can miss a token whose chunk hasn't
    // finished pre-warming into CHUNK_CACHE yet (a single background fetch
    // in init() that the whole cache depends on, with no guarantee it's
    // finished by the time a user hovers a chart dot, especially shortly
    // after load or a collection switch). Re-fetches via
    // _getTokenImgSrcAsync() and re-shows the tooltip with the now-loaded
    // image -- but only if still hovering this SAME point by the time it
    // resolves, so a stale image never pops back up after the user's
    // already moved to a different dot.
    _getTokenImgSrcAsync(cd.id).then(img => {
      if(img && host._scatterHoverId === cd.id){
        _showChartTooltip('_scatterTT', ev.clientX, ev.clientY, _scatterTooltipHtml(cd, img));
      }
    });
  });
  host.on('plotly_unhover', () => { host._scatterHoverId = null; _hideChartTooltip('_scatterTT'); });
  // Same tap-to-preview pattern as renderFloorTrend() below: first tap
  // shows the same image-including tooltip hover already shows on
  // desktop, a second tap on that SAME point opens the modal. Desktop is
  // unaffected -- hover already shows the preview there, so a click there
  // still opens directly.
  host.on('plotly_click', data => {
    const cd = data.points[0].customdata;
    if(!cd?.id || typeof openModal !== 'function') return;
    if(host._scatterLastTapId === cd.id){
      host._scatterLastTapId = null;
      openModal(cd.id);
    } else {
      host._scatterLastTapId = cd.id;
      const clientX = data.event.clientX, clientY = data.event.clientY;
      _showChartTooltip('_scatterTT', clientX, clientY, _scatterTooltipHtml(cd, _getTokenImgSrc(cd.id), true));
      _getTokenImgSrcAsync(cd.id).then(img => {
        if(img && host._scatterLastTapId === cd.id){
          _showChartTooltip('_scatterTT', clientX, clientY, _scatterTooltipHtml(cd, img, true));
        }
      });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE: Floor Price Trend (from sales history)
// ════════════════════════════════════════════════════════════════════════════
window._floorLoaded = false;
window._floorDays = 30;
window._floorEvents = [];
// Floor trend loaded by 4s background fetch in init block

function _floorRerenderVisible(){
  let any = false;
  ['floorTrendHost','floorFullscreenHost'].forEach(id => { const h = document.getElementById(id); if(h && h.offsetWidth > 0){ any = true; renderFloorTrend(id); } });
  if(!any) renderFloorTrend();
}
function _floorClosePreview(hostId){
  _hideChartTooltip('_floorTT');
  const h = document.getElementById(hostId); if(h) h._floorLastTapId = null;
}
// Fullscreen top controls for the Floor Trend: same range buttons + trait
// filter as the tab, kept in sync with it.
function _floorFsControls(){
  const bar = document.getElementById('chartFullscreenTopControls');
  const desc = document.getElementById('chartFullscreenDescription');
  if(desc){ desc.innerHTML = ''; desc.classList.remove('sc-desc-docked'); }
  if(!bar) return;
  const d = window._floorDays;
  const ranges = [[30,'30d'],[90,'90d'],[180,'180d'],[365,'1y'],[9999,'All']];
  const picker = _buildSaleChartTraitPickerHtml('floorFullscreenHost', { traitsOnly: true });
  const zoomed = !!document.getElementById('floorFullscreenHost')?._scZoomRanges;
  bar.innerHTML = ranges.map(([v, l]) => `<button type="button" class="mispriced-mode-btn${v === d ? ' active' : ''}" data-frange="${v}" onclick="setFloorRange(${v})">${l}</button>`).join('')
    + picker.topHtml + picker.bottomHtml
    + (zoomed ? `<button type="button" class="sc-reset-btn" onclick="document.getElementById('floorFullscreenHost')._scResetFn()">↺ Reset</button>` : '');
}
// Tab controls: the same trait picker next to the range buttons, chips below.
function _floorTabControls(){
  const pick = document.getElementById('floorTraitPicker'), chips = document.getElementById('floorTraitChips');
  if(!pick || !chips) return;
  const picker = _buildSaleChartTraitPickerHtml('floorTrendHost', { traitsOnly: true });
  pick.innerHTML = picker.topHtml;
  chips.innerHTML = picker.bottomHtml;
}
function setFloorRange(days){
  window._floorDays = days;
  document.querySelectorAll('[data-frange]').forEach(b =>
    b.classList.toggle('active', +b.dataset.frange === days));
  _floorRerenderVisible();
}

async function loadFloorTrend(force){
  if(window._floorLoaded && !force) return renderFloorTrend();
  const host = document.getElementById('floorTrendHost');
  if(host) host.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:20px 0">Loading sales history...</div>';

  try{
    // Try Railway DB first — instant, no sequential OpenSea fetches needed
    let loaded = false;
    try{
      // jv: "Floor trend still doesn't load up until I hit refresh" --
      // these two dbFetch calls had no timeout at all. If either one hangs
      // (a slow response, or this page's own many other concurrent
      // dbFetch calls saturating the browser's connection pool right as
      // this tab is switched to), the whole function sits stuck forever
      // at this await -- never reaching the OpenSea fallback that already
      // exists right below, never showing an error, nothing. A manual
      // Refresh "working" afterward is just a second attempt getting a
      // clean run, not Refresh doing anything the automatic trigger
      // doesn't already do.
      // jv (later, connecting it to the "0 Traits shows nothing" bug):
      // "noticed that where the chart doesn't properly load all the
      // data like I shared with you before, that's when the chart
      // doesn't show anything for 0 traits." That's this timeout firing
      // too eagerly: the DB path (LIMIT 20000, comfortably above this
      // collection's own ~15k total sales) is the complete one, but the
      // OpenSea fallback below caps at 10 pages x 100 = 1000 events,
      // newest-first -- a much smaller, incomplete slice. Rare sales
      // (0-trait tokens especially) are the first thing to disappear
      // entirely from a slice that small, while common trait sales
      // still show SOME representation by sheer volume. Raised from 8s
      // to 20s so a real (if slow) DB query -- e.g. right after its
      // 2-minute cache expires -- has room to actually finish, rather
      // than falling through to the far-less-complete fallback just for
      // being a little slow.
      const _timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error('floor-trend DB fetch timed out')), ms));
      // jv: "all sales in the history should always be loaded for both
      // floor trend and sales chart." Was hardcoded to 90 days/90*24
      // hours here regardless of which day-range button is actually
      // selected in the UI -- meaning "1y" or "All" never showed more
      // than 90 days' worth no matter what, since the fetch itself
      // never went back further than that in the first place. The
      // backend's own former caps on both endpoints (365 days,
      // 9600 hours) are gone too, so 36500/36500*24 here now genuinely
      // pulls the full history rather than immediately hitting a
      // still-too-low ceiling on the other end. Client-side filtering
      // by the selected range (see the cutoff math in renderFloorTrend/
      // renderSaleChart) already expects to work this way -- filtering
      // a larger, complete dataset down to whatever's selected -- so
      // this alone is what full range buttons needed to actually work.
      const [data, fhData] = await Promise.race([
        Promise.all([
          dbFetch('/db/floor-trend', { days: 36500 }),
          dbFetch('/db/floor-history', { hours: 36500*24 }).catch(()=>null)
        ]),
        _timeout(20000)
      ]);
      if(data.ok && data.sales && data.sales.length > 0){
        // jv: found while investigating a Sale Chart complaint -- this
        // (fast, primary) path never carried buyer/seller at all, so
        // wallet-grouping ("2+ buys" connecting lines, wallet search/
        // highlight) could only ever have worked on the rare occasion
        // this fetch failed and the OpenSea-event fallback below ran
        // instead (that path's raw events do carry buyer/seller
        // directly). /db/floor-trend now selects and returns them too.
        window._floorEvents = data.sales.map(s => ({
          event_type: 'sale',
          payment: { quantity: String(Math.round(s.price_eth * 1e18)), symbol: s.currency || 'ETH' },
          nft: { identifier: String(s.token_id) },
          closing_date: new Date(s.sale_ts).getTime() / 1000,
          buyer: s.buyer || null,
          seller: s.seller || null,
          // null = OpenSea; otherwise where the sale actually happened
          // ('blur', 'gondi', 'gondi-trade', ...) -- bot's Gondi activity sync
          marketplace: s.marketplace || null,
          obs_rank: s.obs_rank
        }));
        // Store floor_history points for the true floor line
        window._floorHistory = (fhData?.ok && fhData.history?.length)
          ? fhData.history.slice().reverse() // oldest first
          : [];
        window._floorLoaded = true;
        populateFloorTraitFilter();
        renderFloorTrend();
        loaded = true;
      }
    } catch(e){
      console.warn('DB floor-trend failed, falling back to OpenSea:', e.message);
    }

    if(loaded) return;

    // Fallback: sequential OpenSea fetches. jv: "that's when the chart
    // doesn't show anything for 0 traits" -- was capped at 10 pages x
    // 100 = 1000 events (newest-first), a tiny, incomplete fraction of
    // this collection's ~15k total sales. Rare things (0-trait sales
    // especially) are the first to vanish entirely from a slice that
    // small. Raised to 150 pages (~15,000 events, matching the DB
    // path's own effective ceiling) so this fallback is genuinely
    // complete rather than just fast -- slower if it ever actually
    // triggers (now a rare last resort given the 20s timeout above,
    // not the common case), but a correct, complete result matters far
    // more here than shaving off a few seconds.
    let all = [];
    const qs0 = new URLSearchParams({slug: LIVE_SLUG, event_type:'sale', limit:'100'});
    const r0 = await fetch(`${LIVE_ENDPOINT}/os/events?${qs0}`);
    if(r0.ok){
      const j0 = await r0.json();
      all = j0.events || [];
      let cursor = j0.next_cursor;
      for(let i = 1; i < 150 && cursor; i++){
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
// jv: floor trend -- "I personally like the look of the floor trend chart"
// -> keep it, with "a full screen view just like the sales chart". Draws into
// the tab (floorTrendHost) or the fullscreen overlay (floorFullscreenHost),
// which gives it the phone fullscreen behavior (landscape, scroll pinning,
// tap-offset fix), plus the Sale Chart's touch handling: clean taps (no
// modebar/drag-zoom/double-tap reset on touch), a tap preview with ×, smooth
// pinch, one-finger pan (fullscreen) and '↺ Reset'.
function renderFloorTrend(hostId){
  hostId = hostId || 'floorTrendHost';
  const host = document.getElementById(hostId);
  if(!host) return;
  const again = () => renderFloorTrend(hostId);
  const isFs = hostId === 'floorFullscreenHost';
  // jv: "Floor trend tab doesn't load until I hit the refresh button."
  // Root cause: this function's only success-path DOM update is
  // Plotly.newPlot() near the bottom -- there's no separate innerHTML
  // write beforehand, unlike the "No sales data yet"/"No sales in this
  // time range" early-return cases just below. If Plotly hasn't finished
  // loading yet (a real race on a quick tab switch right after page
  // load), Plotly.newPlot throws a ReferenceError, uncaught, and this
  // whole function aborts right there -- never touching the DOM at all,
  // leaving the original static placeholder text stuck forever. Manually
  // clicking Refresh later "fixes" it purely because enough time has
  // passed for Plotly to have finished loading by then. Same guard other
  // charts in this app already use for this exact race (chart.js's
  // drawOrUpdateChart, burnsAnalytics.js's drawBurnActivityChart) --
  // retry shortly instead of throwing.
  if(typeof Plotly === 'undefined'){ window.ensurePlotly && window.ensurePlotly(); setTimeout(again, 80); return; }

  // jv: floor trend still wasn't showing up until clicking a timeframe
  // button (which just re-runs this same function -- setFloorRange()
  // above does nothing but set the day cutoff and call renderFloorTrend()
  // again). Root cause: this runs synchronously in the same tick as
  // switchTopTab() giving this tab panel its .active class -- the browser
  // hasn't actually applied that display change and re-flowed the layout
  // yet, so Plotly.newPlot() below measures a zero-width/zero-height
  // container and draws nothing visible into it. A later call (e.g. the
  // range button) works purely because the layout has settled by then.
  // Deferring one animation frame lets the browser actually apply the
  // panel's visibility first.
  if(host.offsetWidth === 0){ requestAnimationFrame(again); return; }

  const events = window._floorEvents;
  if(!events.length){
    host.innerHTML = '<div class="sc-empty-msg" style="color:var(--sub);font-size:12px;padding:20px 0">No sales data yet.</div>';
    return;
  }

  const days = window._floorDays;
  const cutoff = Date.now()/1000 - days*86400;

  // Trait filter
  // jv: "The trait filter should work like the same in sales chart but only
  // shows like the 'trait' not the type... I would just copy the sales trait
  // filter over into the floor trend." Same picker, one shared selection
  // (window._saleChartActiveTraits / _saleChartTraitCount / match mode).
  // The old dropdown matched via ROW_CACHE, which is often empty, so a trait
  // pick could silently drop most sales; rows come from the full trait data
  // now, and any not loaded yet are fetched, then the chart redraws.
  const _fPairs = [];
  for(const [name, vals] of (window._saleChartActiveTraits || new Map())) for(const val of vals) _fPairs.push({ name, value: val });
  if(window._saleChartTraitCount != null) _fPairs.push({ isCount: true, value: window._saleChartTraitCount });
  const _fAll = window._saleChartMatchMode === 'all';
  let _fMissing = 0;
  const _fRow = id => ROW_CACHE.get(id) || window._saleChartRowById?.get(id) || CHUNK_CACHE.get(chunkIndexFor(id))?.[String(id)] || null;
  const _fMatch = id => {
    const row = _fRow(id);
    if(!row){ _fMissing++; return false; }
    const hits = _fPairs.filter(p => p.isCount ? (typeof getTraitCount === 'function' && getTraitCount(row) === p.value) : String(row.traits?.[p.name]) === String(p.value)).length;
    return _fAll ? hits === _fPairs.length : hits > 0;
  };
  if(isFs) _floorFsControls(); else _floorTabControls();

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
      if(_fPairs.length && !_fMatch(id)) continue;
      const entry = { ts, eth, id, rank, currency, isWeth,
        seller: ev.seller||'', buyer: ev.buyer||'',
        date: new Date(ts*1000) };
      allSalesDots.push(entry);
      if(!isWeth) sales.push(entry); // floor = ETH only
    }catch{}
  }

  if(_fPairs.length && _fMissing && !window._floorTraitRowsRequested && typeof indices === 'function' && typeof ensureChunk === 'function'){
    window._floorTraitRowsRequested = true;
    Promise.all(indices().map(i => ensureChunk(i))).then(() => _floorRerenderVisible()).catch(() => {});
  }
  if(!sales.length){
    // purge also drops Plotly's event handlers -> re-attach on the next draw
    if(typeof Plotly !== 'undefined'){ try{ Plotly.purge(host); }catch(_){} host._floorListenersBound = false; }
    host.innerHTML = `<div class="sc-empty-msg" style="color:var(--sub);font-size:12px;padding:20px 0">${_fPairs.length ? 'No sales match this trait filter in this time range.' : 'No sales in this time range.'}</div>`;
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
    // jv: "Floor trend is pretty buggy and slow to load. Taps are delayed."
    // One SVG element per sale (16k+) was heavy on phones; GPU renderer,
    // like the Sale Chart's dots.
    mode:'markers', type:'scattergl',
    name:'Sales',
    // Hollow rings, explicitly: the old SVG renderer outlined each faint
    // dot (the ring look jv likes); the GPU renderer doesn't, so ask for it.
    marker:{
      size: allSalesDots.map(s=>s.isWeth?5:6),
      // jv: "The floor trend rings can go back to white" -> soft white rings
      // (dark charcoal on Minimal Light, where white would vanish).
      color: (()=>{ const _ml = document.documentElement.getAttribute('data-theme') === 'minimal-light';
        const _w = _ml ? 'rgba(24,24,27,.30)' : 'rgba(235,238,245,.35)';
        return allSalesDots.map(s=>s.isWeth?'rgba(167,139,250,.6)':_w); })(),
      symbol:'circle-open', line:{ width:1 }
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

  // jv: "the floor trend line is flat and there is no sales line like
  // they're used to be." A handful of genuinely high-value rare-trait
  // sales (this chart auto-scales to whatever the highest value in any
  // trace is) push the y-axis up far enough that the actual floor line
  // -- sitting at roughly floor price the whole time -- gets crushed
  // into a barely-visible flat line near the bottom, and the sales dots
  // read as meaningless scatter rather than a legible trend. First fixed
  // with an explicit linear range sized to the floor/7d-avg data itself
  // (floorMax*3) rather than whatever the single highest sale happened
  // to be.
  //
  // jv (later): "the floor trend view should expand up a little higher
  // just like the sale chart view... so it's not so bunched up" --
  // that linear cap still crushes everything below it whenever an
  // outlier sale sits close to or above the cap itself (exactly what
  // happened: a real Sep sale pushed the range to ~2.2 ETH, squeezing
  // the whole 0-0.5 ETH floor band most days actually live in in into a
  // sliver, with the legend sitting right on top of the densest part of
  // it). Switched to a log y-axis instead, the same fix already applied
  // to the Sale Chart tab (renderSaleChart()) for this identical
  // long-tailed-price problem -- lets Plotly autorange naturally rather
  // than needing a hand-tuned multiplier, and an outlier sale can no
  // longer crush the far-more-common cheaper band beneath it.
  const traces = [saleTrace, floorTrace, maTrace];
  if(fhTrace) traces.push(fhTrace);

  const layout = {
    // jv: chart was flashing on then vanishing on mobile. Root cause of
    // that specific symptom: switchAnalyticsSheetTab() (mobile bottom
    // sheet) constrains this container to a fixed 240px via a raw inline
    // style, but this layout hardcoded height:300 regardless -- Plotly
    // laid itself out at 300px, then a separate, independently-timed
    // Plotly.Plots.resize() call 300ms later forcibly reconciled the
    // mismatch, producing a second, jarring re-layout right after the
    // first render. Reading the container's own actual current height
    // (already set by whichever caller constrained it, mobile sheet or
    // otherwise) keeps Plotly's own layout in agreement with it from the
    // very first render, instead of rendering wrong and correcting later.
    // jv: fullscreen "keeps wanting to go back to portrait view". With no
    // width, Plotly sized itself by measuring the page -- and in the
    // CSS-rotated fullscreen that measurement is the rotated (portrait) box.
    // Explicit width/height from the host itself (unrotated), like the Sale
    // Chart; in fullscreen Plotly's own resize is off (ResizeObserver in
    // _scBindPinch keeps it sized).
    width: host.clientWidth > 50 ? host.clientWidth : undefined,
    height: host.clientHeight > 50 ? host.clientHeight : 300,
    margin: isFs ? {l:44, r:8, b:28, t: (() => { const tb = document.querySelector('.chart-fullscreen-topbar'); return (tb ? Math.max(8, tb.offsetHeight + 6) : 8) + (window._tvIsPhone() ? 18 : 0); })()}
                 : {l:56,r:16,t:10,b:48},
    paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)',
    font:{color:textColor, size:11},
    xaxis:{color:subColor, gridcolor:_themeGrid(), zeroline:false},
    // Same log-axis tick declutter as Sale Chart's own y-axis (see its
    // comment) -- dtick:1 shows only the major decades (0.1, 1, 10)
    // instead of every digit within each one.
    yaxis:{title:'ETH', type:'log', dtick:1, color:subColor, gridcolor:_themeGrid(), zeroline:false, tickformat:'.4f'},
    showlegend:true,
    legend:{x:0,y:1,font:{size:10},bgcolor:'rgba(0,0,0,0)'},
    hovermode:'closest'
  };

  // Make Plotly's built-in tooltip invisible — we draw our own
  layout.hoverlabel = {bgcolor:'rgba(0,0,0,0)', bordercolor:'rgba(0,0,0,0)', font:{color:'rgba(0,0,0,0)', size:1}};
  // jv: "switching the time frame, it lags and lags the whole analytics
  // tabs. I have to refresh the page." Confirmed this got worse with
  // every timeframe click, matching the same listener-accumulation shape
  // as the original "buggy and laggy" report -- despite host.on()/
  // removeAllListeners() being real, documented Plotly.js API (it uses a
  // Node-style EventEmitter internally), something about calling
  // removeAllListeners() then Plotly.react() repeatedly on the same div
  // still wasn't preventing accumulation in practice. Rather than keep
  // trusting that exact mechanism, this now structurally can't leak:
  // the hover/click/unhover handlers are bound to this host EXACTLY ONCE
  // ever (guarded by host._floorListenersBound), and read the current
  // sales data from host._floorRenderState -- a plain object reassigned
  // fresh on every render -- instead of closing over a new copy of that
  // data at attach-time. So there is only ever one of each listener for
  // the life of the page, full stop, regardless of how many times this
  // function runs.
  // Fullscreen on phones: legend as one line along the top-left (no modebar).
  if(isFs && window._tvIsPhone()) layout.legend = {orientation:'h', x:0, y:1, xanchor:'left', yanchor:'bottom', font:{size:10}, bgcolor:'rgba(0,0,0,0)'};
  // Keep a pinch/pan zoom across redraws ('↺ Reset' clears it).
  if(host._scZoomRanges){
    layout.xaxis = Object.assign({}, layout.xaxis, { range: host._scZoomRanges.x.slice(), autorange: false });
    layout.yaxis = Object.assign({}, layout.yaxis, { range: host._scZoomRanges.y.slice(), autorange: false });
  }
  const _touch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if(_touch) layout.dragmode = false;
  host._floorRenderState = { allSalesDots };
  host.querySelectorAll(':scope > .sc-empty-msg, :scope > #floorTrendInit').forEach(el => el.remove());
  Plotly.react(host, traces, layout, {
    responsive: !isFs,
    displayModeBar: !_touch,
    displaylogo:false,
    doubleClick: _touch ? false : 'reset+autosize',
    modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d','toggleSpikelines'],
    modeBarButtonsToKeep:['zoom2d','pan2d','zoomIn2d','zoomOut2d','resetScale2d'],
    scrollZoom:true
  });
  host._scResetFn = () => {
    host._scZoomRanges = null;
    document.querySelectorAll('#chartFullscreenTopControls .sc-reset-btn').forEach(b => b.remove());
    renderFloorTrend(hostId);
  };
  if(typeof _scBindPinch === 'function') _scBindPinch(host);

  if(host._floorListenersBound) return;
  host._floorListenersBound = true;

  // Custom frosted hover + click
  function _floorSaleTooltipHtml(id, sale, img, isTap){
    const imgH = img ? `<img src="${img}" style="width:60px;height:60px;object-fit:contain;border-radius:6px;image-rendering:pixelated;display:block;margin-bottom:8px">` : '';
    const rank = `<div style="font-size:11px;margin-bottom:3px">${displayRankHtml(id, 'font-weight:700;')}</div>`;
    const seller = sale.seller ? `<div style="font-size:10px;color:#7a8fa8;margin-top:4px">From: ${sale.seller.slice(0,6)}…${sale.seller.slice(-4)}</div>` : '';
    const buyer  = sale.buyer  ? `<div style="font-size:10px;color:#7a8fa8">To: ${sale.buyer.slice(0,6)}…${sale.buyer.slice(-4)}</div>` : '';
    const ts     = sale.ts ? `<div style="font-size:10px;color:#7a8fa8;margin-top:2px">${new Date(sale.ts*1000).toLocaleString()}</div>` : '';
    const closeBtn = isTap ? `<span onclick="_floorClosePreview('${host.id}')" style="position:absolute;top:4px;right:6px;font-size:16px;line-height:1;color:#7a8fa8;cursor:pointer;pointer-events:auto;padding:4px">×</span>` : '';
    return `${closeBtn}${imgH}
        <div style="font-weight:700;font-size:13px;margin-bottom:2px">#${id}</div>
        ${rank}
        <div style="font-size:14px;font-weight:700;color:${sale.isWeth?'#f87171':'var(--good)'};margin-bottom:4px">${(!sale.currency || sale.currency === 'ETH' || sale.currency === 'WETH') ? 'Ξ ' : ''}${sale.eth ? sale.eth.toFixed(4) : '?'} ${sale.currency||'ETH'}</div>
        ${seller}${buyer}${ts}
        <div style="color:#7a8fa8;font-size:10px;margin-top:6px">${isTap ? 'Tap again to open token' : 'Click to open token'}</div>`;
  }
  const _floorTouch = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  host.on('plotly_hover', data=>{
    if(_floorTouch()) return;   // touch: taps own the preview (a tap also fires a synthetic hover)
    const pt  = data.points[0];
    const ev  = data.event;
    const allSalesDots = host._floorRenderState?.allSalesDots || [];
    if(pt.data.name === 'Sales' && pt.customdata){
      const id   = pt.customdata;
      const sale = allSalesDots.find(s=>s.id===id) || {};
      host._floorHoverId = id;
      _showChartTooltip('_floorTT', ev.clientX, ev.clientY, _floorSaleTooltipHtml(id, sale, _getTokenImgSrc(id)));
      // jv: "I was in desktop when I noticed they weren't being
      // displayed." Same class of gap as the scatter chart's own hover
      // handler above -- the synchronous lookup can miss a token whose
      // chunk hasn't finished pre-warming into CHUNK_CACHE yet. Re-fetches
      // and re-shows the tooltip once loaded, only if still hovering this
      // same point.
      _getTokenImgSrcAsync(id).then(img => {
        if(img && host._floorHoverId === id){
          _showChartTooltip('_floorTT', ev.clientX, ev.clientY, _floorSaleTooltipHtml(id, sale, img));
        }
      });
    } else if(pt.data.name === 'Daily Floor'){
      host._floorHoverId = null;
      const html = `<div style="font-weight:600;margin-bottom:3px">${pt.x}</div>
        <div style="color:#2dd4bf;font-weight:700;font-size:14px">Floor: ${(+pt.y).toFixed(4)} ETH</div>`;
      _showChartTooltip('_floorTT', ev.clientX, ev.clientY, html);
    }
  });
  host.on('plotly_unhover', ()=> { if(_floorTouch()) return; host._floorHoverId = null; _hideChartTooltip('_floorTT'); });
  // jv: "let's make sure that the dots on those graphs display the token
  // images as well" -- the rich tooltip above (with the token's own
  // image) was already built, but only ever wired to plotly_hover, a
  // mouse-only event that never fires on a touch device at all. Confirmed
  // this is exactly why it never showed up for jv, who works primarily on
  // mobile -- plain plotly_click went straight to openModal(), skipping
  // the image preview entirely (the modal itself does show the image, but
  // only after a full navigation away from the chart, not as a quick
  // preview on it). Same tap-to-preview, tap-again-to-open pattern as
  // renderScatter() below: first tap on a dot shows this same tooltip
  // (image included); a second tap on that SAME dot (while its preview is
  // still showing) opens the full modal. Desktop is unaffected -- hover
  // already shows the preview there, so a click there still opens directly.
  host.on('plotly_click', data=>{
    const pt = data.points[0];
    if(pt.data.name!=='Sales' || !pt.customdata || typeof openModal!=='function') return;
    if(Date.now() - (host._scPinchEndTs || 0) < 400) return;   // lift after a pinch/pan isn't a tap
    const id = pt.customdata;
    const allSalesDots = host._floorRenderState?.allSalesDots || [];
    if(host._floorLastTapId === id){
      host._floorLastTapId = null;
      openModal(id);
    } else {
      host._floorLastTapId = id;
      const sale = allSalesDots.find(s=>s.id===id) || {};
      const clientX = data.event.clientX, clientY = data.event.clientY;
      // data.event carries clientX/clientY for both mouse and touch
      // input (Plotly normalizes this) -- positions the preview right
      // where the user actually tapped, same as the hover tooltip does.
      // bypass=true: tap previews must show on touch screens (they never did)
      _showChartTooltip('_floorTT', clientX, clientY, _floorSaleTooltipHtml(id, sale, _getTokenImgSrc(id), true), true);
      _getTokenImgSrcAsync(id).then(img => {
        if(img && host._floorLastTapId === id){
          _showChartTooltip('_floorTT', clientX, clientY, _floorSaleTooltipHtml(id, sale, img, true), true);
        }
      });
    }
  });
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE: Sale Chart -- jv: "Curious how I can get graphs like this and if
// it's possible you can build this out?" Reuses window._floorEvents (the
// same sales dataset Floor Trend already loads -- no separate fetch) and
// the same activeTraits Map the rest of the app already filters the grid
// with, so whatever trait chips are picked in the filter drawer get their
// own colored, chronologically-connected sales series here. Clicking a dot
// anchors on that token: its own resale history draws as a connected
// white/gold path, with thin lines fanning from its most recent sale out to
// every other sale sharing the active trait(s) -- a way to compare one
// specific sale against the rest of that trait's history at a glance.
// ════════════════════════════════════════════════════════════════════════════
window._saleChartDays = 30;
window._saleChartAnchor = null;
// jv (via a detailed ChatGPT-drafted spec he confirmed he wants built):
// match-any vs match-all across multiple simultaneously-active trait
// filters, a minimum-repeat-purchase threshold before a wallet's line
// draws, and a specific-wallet search/highlight.
window._saleChartMatchMode = 'any'; // 'any' | 'all'
window._saleChartMinWalletBuys = 2;
window._saleChartHighlightWallet = null; // lowercase address, or null
const _SALE_CHART_PALETTE = ['#60a5fa','#f472b6','#a3e635','#c084fc','#fb923c','#22d3ee','#f87171','#facc15'];
// jv: "Picking multiple traits to filter, each separate trait should have
// its own color." Colors were assigned by position in the active list,
// so removing one trait reshuffled everyone else's color. Now each trait
// keeps the color it got when picked (first unused palette color),
// released only when that trait is removed. Keys match matchGroups keys.
window._saleChartTraitColors = window._saleChartTraitColors || new Map();
function _scSyncTraitColors(){
  const keys = [];
  for(const [name, vals] of window._saleChartActiveTraits) for(const v of vals) keys.push(`${name}|||${v}`);
  if(window._saleChartTraitCount != null) keys.push(`__COUNT__|||${window._saleChartTraitCount}`);
  const map = window._saleChartTraitColors;
  for(const k of [...map.keys()]) if(!keys.includes(k)) map.delete(k);
  for(const k of keys){
    if(map.has(k)) continue;
    const used = new Set(map.values());
    map.set(k, _SALE_CHART_PALETTE.find(c => !used.has(c)) || _SALE_CHART_PALETTE[map.size % _SALE_CHART_PALETTE.length]);
  }
  return map;
}

// jv: "The 0 trait count is not a selection in the filters" -- see the
// comment in _buildSaleChartTraitPickerHtml() below for the full story.
// jv (follow-up): "I'm not getting any sales data in the chart for 0
// traits" -- fixing the dropdown's own counts wasn't the whole story:
// the actual per-sale trait matching further down in renderSaleChart()
// still looked tokens up via ROW_CACHE.get(s.id), which has the exact
// same incompleteness problem (lazily filled as other tabs happen to
// load chunks) as the one that broke the dropdown -- a 0-trait token
// simply not being in ROW_CACHE yet meant its sale was silently
// skipped by `if(!row) continue;`, even once the dropdown itself
// correctly listed "0 Traits (N)". Loads every chunk once via
// indices()/ensureChunk() (same proven pattern computeFilteredState()
// uses) into ITS OWN complete id->row map -- ensureChunk() only
// populates CHUNK_CACHE (keyed by chunk index), a genuinely different
// cache from ROW_CACHE (keyed by token id), so loading every chunk
// doesn't fill ROW_CACHE as a side effect the way it might seem like
// it should. window._saleChartRowById is then the primary lookup for
// BOTH the count distribution and the actual sale-matching below,
// falling back to ROW_CACHE only until this finishes loading the
// first time.
async function _ensureSaleChartFullData(){
  const dist = {};
  const rowById = new Map();
  // jv: "The 0 trait is still not showing any sales" -- no error
  // handling here meant a single failed chunk fetch (a transient
  // network hiccup, any one bad request out of however many this
  // collection needs) threw, and since the call site only chained
  // .then() with no .catch(), that left window._saleChartFullDataLoading
  // stuck true forever -- silently blocking this from EVER completing
  // or retrying for the rest of the session, with nothing visible to
  // the user to explain why 0-trait (or any other) sales just never
  // showed up. Catching per-chunk so one bad chunk can't take down
  // every other trait/count value with it, plus a .catch() at the call
  // site below so a real failure resets the loading flag and can retry
  // on the next render instead of getting stuck.
  for(const idx of indices()){
    try{
      const ch = await ensureChunk(idx);
      for(const [sid, row] of Object.entries(ch)){
        rowById.set(+sid, row);
        const c = typeof getTraitCount === 'function' ? getTraitCount(row) : null;
        if(c != null) dist[c] = (dist[c]||0) + 1;
      }
    }catch(e){
      console.error('Sale Chart: failed to load chunk', idx, e);
    }
  }
  window._saleChartCountDist = dist;
  window._saleChartRowById = rowById;
  return dist;
}
// jv: "A very sleek way to filter through different traits" -- one
// compact <select> grouped by category (native picker, no extra library),
// plus a removable chip per trait already active. Reads TRAIT_FREQ, the
// same category->value->count table the rest of the app already
// populates its own trait dropdowns/accordion from.
function _buildSaleChartTraitPickerHtml(hostId, opts){
  const cats = Object.keys(TRAIT_FREQ || {}).sort();
  // jv: "in landscape there is no option to change time frames. you
  // can put that into a dropdown so it doesnt take up room." The
  // normal tab already has its own always-visible row of 30d/90d/
  // 180d/1y/All buttons (in index.html, outside this function) --
  // fullscreen has no equivalent at all right now. Rather than
  // duplicate that button row (no room to spare in the fullscreen
  // controls strip), a compact dropdown here, fullscreen only.
  let rangeHtml = '';
  if(hostId === 'chartFullscreenHost'){
    const rangeMenuId = `saleChartRangeMenu-${hostId}`;
    const curDays = window._saleChartDays || 30;
    const ranges = [[1,'24h'],[7,'7d'],[30,'30d'],[90,'90d'],[180,'180d'],[365,'1y'],[9999,'All']]; // jv: added 24h/7d
    const curLabel = ranges.find(r=>r[0]===curDays)?.[1] || '30d';
    rangeHtml = `<div style="position:relative;display:inline-block">
      <button type="button" onclick="_saleChartToggleMenu('${rangeMenuId}')" class="sc-trait-btn">${curLabel} ▾</button>
      <div id="${rangeMenuId}" class="sc-trait-menu" style="display:none;min-width:100px">
        ${ranges.map(([d,label])=>`<div class="sc-trait-option" onclick="setSaleChartRange(${d},'${hostId}'); _saleChartCloseMenu('${rangeMenuId}')">${label}</div>`).join('')}
      </div>
    </div>`;
  }
  // jv: "the trait filter dropdown is still in light grey and not
  // matching the theme... the dropdown is good on mobile, but desktop
  // looks like this." A native <select>'s OPEN popup is rendered by
  // the OS/browser itself, not the page -- color-scheme:dark (tried
  // both via :root inheritance and directly on the element, matching
  // how .studio-select already does it elsewhere in this app) reaches
  // it reliably on mobile but apparently not on this desktop Chrome/
  // Windows combination. Rather than keep chasing a CSS property whose
  // actual effect is platform-dependent, replaced the native <select>
  // entirely with a plain button + an absolutely-positioned div menu
  // we draw and color ourselves -- guaranteed identical everywhere,
  // since none of it is native OS-rendered UI anymore.
  const menuId = `saleChartTraitMenu-${hostId}`;
  let selectHtml = rangeHtml + `<div style="position:relative;display:inline-block">
    <button type="button" onclick="_saleChartToggleMenu('${menuId}')" class="sc-trait-btn">+ Trait…</button>
    <div id="${menuId}" class="sc-trait-menu" style="display:none">`;
  // jv: "The 0 trait count is not a selection in the filters" -- see
  // _ensureSaleChartFullData() above for the full story (ROW_CACHE is
  // only ever partially populated; this loads every chunk explicitly).
  const countDist = window._saleChartCountDist;
  if(!countDist && !window._saleChartFullDataLoading){
    window._saleChartFullDataLoading = true;
    _ensureSaleChartFullData().then(()=>{
      window._saleChartFullDataLoading = false;
      renderSaleChart(hostId);
    }).catch(e=>{
      console.error('Sale Chart: full data load failed', e);
      window._saleChartFullDataLoading = false;
    });
  }
  const countKeys = countDist ? Object.keys(countDist).map(Number).sort((a,b)=>a-b) : [];
  if(countKeys.length){
    selectHtml += '<div class="sc-trait-optgroup-label">Trait Count</div>';
    for(const c of countKeys){
      selectHtml += `<div class="sc-trait-option" onclick="_saleChartAddTraitFilter('__COUNT__|||${c}','${hostId}'); _saleChartCloseMenu('${menuId}')">${c} Trait${c===1?'':'s'} (${countDist[c]})</div>`;
    }
  }
  for(const cat of cats){
    // jv: "the traits in the drop down should show from rarest to
    // least rare. It's unordered right now" -- was alphabetical
    // (Alien, Bone, Coral, Floral, Gold... regardless of how common
    // each actually is); ascending by count instead, so the rarest
    // value in each category always sorts first.
    const vals = Object.keys(TRAIT_FREQ[cat] || {}).sort((a,b) => (TRAIT_FREQ[cat][a]||0) - (TRAIT_FREQ[cat][b]||0));
    if(!vals.length) continue;
    selectHtml += `<div class="sc-trait-optgroup-label">${cat}</div>`;
    for(const val of vals){
      const count = TRAIT_FREQ[cat][val];
      const key = `${cat}|||${val}`;
      const escapedKey = key.replace(/'/g,"\\'");
      selectHtml += `<div class="sc-trait-option" onclick="_saleChartAddTraitFilter('${escapedKey}','${hostId}'); _saleChartCloseMenu('${menuId}')">${val} (${count})</div>`;
    }
  }
  selectHtml += '</div></div>';

  let chipsHtml = '';
  let activeCount = 0;
  const _colors = _scSyncTraitColors();
  const _allMode = window._saleChartMatchMode === 'all';
  // Colored dot = that trait's dot color on the chart (in "All" mode every
  // matched sale satisfies every trait at once, so they share one color).
  const _dot = key => `<span style="width:8px;height:8px;border-radius:50%;flex-shrink:0;background:${_allMode ? _SALE_CHART_PALETTE[0] : (_colors.get(key) || '#888')}"></span>`;
  for(const [name, vals] of window._saleChartActiveTraits){
    for(const val of vals){
      activeCount++;
      chipsHtml += `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:color-mix(in srgb, var(--text) 10%, transparent);border:1px solid color-mix(in srgb, var(--text) 20%, transparent);color:var(--text);font-size:11px">${_dot(`${name}|||${val}`)}${name}: ${val}
        <span onclick="_saleChartRemoveTraitFilter('${name.replace(/'/g,"\\'")}','${String(val).replace(/'/g,"\\'")}','${hostId}')" style="cursor:pointer;opacity:.7;font-size:13px;line-height:1">×</span>
      </span>`;
    }
  }
  // Trait-count's own chip -- window._saleChartTraitCount, kept separate
  // from window._saleChartActiveTraits for the same reason the app-wide
  // currentTraitCount is kept separate from activeTraits (see that
  // matching function's own comments).
  if(typeof window._saleChartTraitCount !== 'undefined' && window._saleChartTraitCount !== null){
    activeCount++;
    chipsHtml += `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:color-mix(in srgb, var(--text) 10%, transparent);border:1px solid color-mix(in srgb, var(--text) 20%, transparent);color:var(--text);font-size:11px">${_dot(`__COUNT__|||${window._saleChartTraitCount}`)}${window._saleChartTraitCount} Trait${window._saleChartTraitCount===1?'':'s'}
      <span onclick="_saleChartSetTraitCountFilter('','${hostId}')" style="cursor:pointer;opacity:.7;font-size:13px;line-height:1">×</span>
    </span>`;
  }

  // jv (spec): "Support both: Match any... Match all..." Only meaningful
  // (and only shown) once there are 2+ active traits to actually combine.
  let modeHtml = '';
  if(activeCount > 1){
    const mode = window._saleChartMatchMode === 'all' ? 'all' : 'any';
    modeHtml = `<span style="display:inline-flex;border-radius:999px;overflow:hidden;border:1px solid color-mix(in srgb, var(--text) 20%, transparent);font-size:10px">
      <span onclick="_saleChartSetMatchMode('any','${hostId}')" style="padding:3px 8px;cursor:pointer;background:${mode==='any'?'rgba(96,165,250,.35)':'transparent'};color:var(--text)">Any</span>
      <span onclick="_saleChartSetMatchMode('all','${hostId}')" style="padding:3px 8px;cursor:pointer;background:${mode==='all'?'rgba(96,165,250,.35)':'transparent'};color:var(--text)">All</span>
    </span>`;
  }

  // jv: "you can remove the group buys option. Just default it to
  // 2+." Removed the UI selector entirely; window._saleChartMinWalletBuys
  // now just stays permanently unset, which the matching logic below
  // (Math.max(2, window._saleChartMinWalletBuys || 2)) already falls
  // back to 2 for -- same behavior as before, minus the control.
  const minBuysHtml = '';

  // jv (spec): "a way to select or search for a specific wallet."
  const searchHtml = `<input type="text" placeholder="Search 0x…, .eth or #" autocapitalize="off" autocorrect="off" spellcheck="false" onkeydown="if(event.key==='Enter'){_saleChartHighlightWalletByAddr(this.value,'${hostId}',this);}" style="font-size:11px;padding:3px 6px;background:color-mix(in srgb, var(--text) 6%, transparent);border:1px solid color-mix(in srgb, var(--text) 20%, transparent);border-radius:6px;color:var(--text);width:110px">`;

  let clearHighlightHtml = '';
  if(window._saleChartHighlightWallet){
    const addr = window._saleChartHighlightWallet;
    const short = addr.slice(0,6)+'…'+addr.slice(-4);
    const nameSpanId = `scWalletName-${hostId}`;
    // jv: "'Highlighted' in the address pill doesn't need to be there.
    // Just the address and or the .eth address if available." Shows
    // the short address immediately, then upgrades in place to the
    // wallet's ENS name if one resolves -- same show-something-now,
    // upgrade-once-the-async-lookup-returns pattern the tap-preview
    // tooltip's own token image already uses. Reuses the existing
    // /tv/identity endpoint (ENS name + linked X account, DB-cached
    // server-side already, so most lookups are a single cheap read
    // rather than a live external call every time).
    // jv: "since that wallet purchase history is purple the address
    // pill should actually be that purple." This pill represents the
    // highlighted WALLET, which the chart itself already draws in
    // light purple (that wallet's other buys) -- the pill's own color
    // was still gold (matching the anchor TOKEN's own color instead,
    // a mismatch with what this specific pill actually refers to).
    // Matched to the same light purple (#c9a9ff) the chart already
    // uses for this.
    clearHighlightHtml = `<span style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:rgba(201,169,255,.15);border:1px solid rgba(201,169,255,.4);color:var(--tc-c9a9ff);font-size:11px"><span id="${nameSpanId}">${short}</span>
      <span onclick="_saleChartClearWalletHighlight('${hostId}')" style="cursor:pointer;opacity:.8;font-size:13px;line-height:1">×</span>
    </span>`;
    _getWalletDisplayNameAsync(addr).then(name => {
      if(!name) return;
      // Only apply if this is still the currently-highlighted wallet --
      // avoids a stale lookup overwriting a newer selection if the user
      // switched wallets before this resolved.
      if(window._saleChartHighlightWallet?.toLowerCase() !== addr.toLowerCase()) return;
      const el = document.getElementById(nameSpanId);
      if(el) el.textContent = name;
    });
  }

  // jv: "the trait filter dropdown and the wallet search should be
  // moved to the very top beside the time frames on desktop." Split
  // into two pieces instead of one combined string -- the caller
  // (renderSaleChart) puts topHtml (dropdown + search, which
  // rangeHtml is already folded into for fullscreen) up in its own
  // row beside the day-range buttons on the normal desktop tab, and
  // bottomHtml (match mode, wallet-highlight chip, active trait
  // chips) stays where the whole thing used to render. Fullscreen
  // still has no separate top row to put topHtml in, so it just joins
  // both back together into its one controls strip, unchanged.
  // jv: "Need a clean way to be able to close the hover display, have the
  // token images up, and then be able to close out of them to bring up a
  // fresh chart." One button, shown whenever a token or wallet is selected
  // or the chart is zoomed: back to a fresh chart (trait filters kept).
  const _rh = document.getElementById(hostId || 'saleChartHost');
  const _dirty = window._saleChartAnchor != null || !!window._saleChartHighlightWallet || !!(_rh && _rh._scZoomRanges);
  const resetHtml = _dirty ? `<button type="button" class="sc-reset-btn" onclick="_saleChartReset('${hostId || 'saleChartHost'}')" title="Clear the selected token, wallet and zoom">↺ Reset</button>` : '';
  // Floor Trend reuses just the trait parts ('+ Trait…', chips, any/all).
  if(opts && opts.traitsOnly) return { topHtml: selectHtml, bottomHtml: modeHtml + chipsHtml };
  return { topHtml: selectHtml + searchHtml + resetHtml, bottomHtml: modeHtml + clearHighlightHtml + chipsHtml };
}
function _saleChartSetMatchMode(mode, hostId){
  window._saleChartMatchMode = mode === 'all' ? 'all' : 'any';
  renderSaleChart(hostId || 'saleChartHost');
}
function _saleChartSetMinWalletBuys(n, hostId){
  window._saleChartMinWalletBuys = Math.max(2, parseInt(n, 10) || 2);
  renderSaleChart(hostId || 'saleChartHost');
}
// jv: custom trait dropdown (see _buildSaleChartTraitPickerHtml above
// for why this replaced the native <select> entirely). Toggling closes
// any OTHER open trait menu first -- normal tab and fullscreen each
// have their own (keyed by hostId), but only one should ever actually
// be open at a time given they're never both visible simultaneously.
// jv: "in landscape there is no option to change time frames. you can
// put that into a dropdown so it doesnt take up room." Generalized
// from menu-id-per-hostId to a plain menu-id parameter so this same
// toggle/close pair also drives the new range dropdown below, not
// just the trait one.
function _saleChartToggleMenu(menuId){
  const menu = document.getElementById(menuId);
  if(!menu) return;
  const isOpen = menu.style.display !== 'none';
  document.querySelectorAll('.sc-trait-menu').forEach(m => { if(m !== menu) m.style.display = 'none'; });
  menu.style.display = isOpen ? 'none' : 'block';
}
function _saleChartCloseMenu(menuId){
  const menu = document.getElementById(menuId);
  if(menu) menu.style.display = 'none';
}
// Close on outside click -- bound once ever at the top level (not
// inside a render function, which would rebind it on every render).
document.addEventListener('click', e => {
  document.querySelectorAll('.sc-trait-menu').forEach(menu => {
    if(menu.style.display === 'none') return;
    const wrapper = menu.parentElement; // the position:relative div holding both the button and this menu
    if(wrapper && !wrapper.contains(e.target)) menu.style.display = 'none';
  });
});

// jv: "The sales chart filter tab should only filter within the sales
// chart, not the entire page." These previously wrote directly into
// activeTraits/currentTraitCount -- the SAME shared state the sidebar,
// main grid, and trait chips all read/write -- so picking a trait
// here to compare sales by trait was also silently re-filtering the
// entire token grid behind it. Switched to a separate, Sale-Chart-only
// Map/value (window._saleChartActiveTraits / window._saleChartTraitCount)
// that only this picker and renderSaleChart()'s own matching logic
// touch, so it can no longer reach the rest of the page. This also
// removes the need for the previous reload-mitigation deferral
// (setTimeout/updateChartAndList) entirely -- there's no more heavy
// app-wide rebuild to stack on top of, just this chart's own re-render.
window._saleChartActiveTraits = window._saleChartActiveTraits || new Map();
function _saleChartRerenderBoth(hostId){
  _scForgetPreTap();
  ['saleChartHost','chartFullscreenHost'].forEach(id => { const h = document.getElementById(id); if(h) h._scZoomRanges = null; });
  renderSaleChart(hostId || 'saleChartHost');
  const other = hostId === 'chartFullscreenHost' ? 'saleChartHost' : 'chartFullscreenHost';
  const otherEl = document.getElementById(other);
  if(otherEl && otherEl.offsetWidth > 0) renderSaleChart(other); // hidden copy renders when it's shown
}
function _saleChartAddTraitFilter(key, hostId){
  if(!key) return;
  if(key.startsWith('__COUNT__|||')){
    _saleChartSetTraitCountFilter(key.slice('__COUNT__|||'.length), hostId);
    return;
  }
  const idx = key.indexOf('|||');
  if(idx < 0) return;
  const name = key.slice(0, idx), val = key.slice(idx+3);
  if(!window._saleChartActiveTraits.has(name)) window._saleChartActiveTraits.set(name, new Set());
  window._saleChartActiveTraits.get(name).add(val);
  _saleChartRerenderBoth(hostId);
}
function _saleChartSetTraitCountFilter(value, hostId){
  window._saleChartTraitCount = (value === '' || value == null) ? null : Number(value);
  _saleChartRerenderBoth(hostId);
}
function _saleChartRemoveTraitFilter(name, val, hostId){
  const s = window._saleChartActiveTraits.get(name);
  if(s){ s.delete(val); if(!s.size) window._saleChartActiveTraits.delete(name); }
  _saleChartRerenderBoth(hostId);
}

function setSaleChartRange(days, hostId){
  _scForgetPreTap();
  window._saleChartDays = days;
  ['saleChartHost','chartFullscreenHost'].forEach(id => { const h = document.getElementById(id); if(h) h._scZoomRanges = null; });
  document.querySelectorAll('[data-scrange]').forEach(b =>
    b.classList.toggle('active', +b.dataset.scrange === days));
  renderSaleChart(hostId);
}

function setSaleChartAnchor(id, hostId, keepWallet){
  window._saleChartAnchor = id;
  const btn = document.getElementById('saleChartClearAnchor');
  if(btn) btn.style.display = id ? 'inline-flex' : 'none';
  // jv: "When I click a dot I want that little turn thumbnail preview
  // and I want all of the dots to dim a little and if the wallet that
  // purchased that token has any more buys highlight those dots." Reuses
  // the exact same dim/highlight rendering a manual wallet search
  // already does -- selecting a token just derives and sets that same
  // window._saleChartHighlightWallet for you, from this token's own most
  // recent buyer, rather than needing a separate click on the tooltip's
  // "Highlight this wallet" link. Unified both ways too: clearing the
  // anchor also clears the wallet highlight (below), and
  // _saleChartClearWalletHighlight() clears the anchor right back.
  // keepWallet: the tapped dot belongs to the already-highlighted wallet
  // (one of its buys or sells) -- keep that wallet's history on screen and
  // just select the token, instead of jumping the highlight to whoever
  // bought this token last (for a sell, that's the other party).
  if(id && keepWallet){
    // leave window._saleChartHighlightWallet as-is
  } else if(id){
    const events = window._floorEvents || [];
    let latestBuyer = null, latestTs = -1;
    for(const ev of events){
      if(+(ev.nft?.identifier||0) !== id) continue;
      const ts = ev.closing_date || ev.event_timestamp;
      if(ts != null && ts > latestTs){ latestTs = ts; latestBuyer = ev.buyer || null; }
    }
    window._saleChartHighlightWallet = latestBuyer ? latestBuyer.toLowerCase() : null;
  } else {
    window._saleChartHighlightWallet = null;
  }
  renderSaleChart(hostId || 'saleChartHost');
}

// Tear a Sale Chart host down AND hand its GPU memory back immediately.
// Plotly.purge() drops the canvases, but the WebGL contexts behind them
// linger until garbage collection -- on iOS that lag is enough to run
// out of memory. WEBGL_lose_context releases them right away. Also
// re-arms the bound-once Plotly listeners, since purge strips those.
function _scReleaseGL(host){
  if(!host) return;
  try{
    host.querySelectorAll('canvas').forEach(c => {
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    });
  }catch(e){}
  try{ Plotly.purge(host); }catch(e){}
  host._saleChartListenersBound = false;
  host._walletDeepDiveListenersBound = false; // deep-dive host uses its own flag
  host._floorListenersBound = false;          // Floor Trend (fullscreen close purges it)
}


// ── Wallet stats in the Sale Chart legend (Accumulation Tracker) ─────────
// jv (from the ChatGPT feature list): "Trait Accumulation Tracker" -- then
// "Where could we fit this in where it's not taking too much screen space
// especially on mobile?" -> chosen: when a wallet is highlighted, the
// legend line ("● Token's history ● Wallet buys ● Wallet sells") becomes
// that wallet's stats ("● 7 buys ● 3 sells · Net +4 · Holds 5 ›"); tapping
// it opens a small panel with both "this trait" and "overall" columns.
// Zero extra screen space, never covers dots, separate from the tooltip.
const _SC_LEGEND_DEFAULT = '<span style="color:var(--tc-ffd76a);font-weight:700">●</span> Token\'s history <span style="color:var(--tc-c9a9ff);font-weight:700">●</span> Wallet buys <span style="color:var(--tc-f87171);font-weight:700">●</span> Wallet sells';
window._scStatsOpen = window._scStatsOpen || false;

function _scFullEvents(){
  // Full sale history (all time), normalized. Cached per _floorEvents array.
  const ev = window._floorEvents || [];
  if(window._scFullEventsSrc === ev && window._scFullEventsCache) return window._scFullEventsCache;
  const out = [];
  for(const e of ev){
    const id = parseInt(e?.nft?.identifier, 10);
    const q = parseFloat(e?.payment?.quantity);
    if(!Number.isFinite(id) || !Number.isFinite(q)) continue;
    out.push({ id, eth: q / 1e18, ts: e.closing_date,
      buyer: (e.buyer || '').toLowerCase(), seller: (e.seller || '').toLowerCase() });
  }
  out.sort((a,b) => a.ts - b.ts);
  window._scFullEventsSrc = ev; window._scFullEventsCache = out;
  return out;
}

function _scHeldIds(wallet){
  const d = window._holdersData;
  if(!d || !Array.isArray(d.sorted_wallets)) return null; // not loaded yet
  const w = d.sorted_wallets.find(x => (x.wallet || '').toLowerCase() === wallet);
  return w ? (w.ids || []) : [];
}

// Stats for one wallet over the chart's selected time range. P&L matches
// each SALE to this wallet's most recent earlier BUY of the same token,
// searched across the FULL history (so a token bought before the range
// and sold inside it still counts); sells with no earlier buy on record
// (minted / received by transfer) are excluded from P&L and counted.
function _scComputeWalletStats(wallet, cutoffTs, tokenMatches){
  const all = _scFullEvents();
  const inScope = id => !tokenMatches || tokenMatches(id);
  let bought = 0, sold = 0, spent = 0, received = 0, pnl = 0, pnlMatched = 0, pnlUnmatched = 0;
  const lastBuy = new Map(); // token id -> price of this wallet's latest buy so far
  for(const e of all){
    const isBuy = e.buyer === wallet, isSell = e.seller === wallet;
    if(!isBuy && !isSell) continue;
    const scoped = inScope(e.id);
    if(isSell && e.ts >= cutoffTs && scoped){
      sold++; received += e.eth;
      if(lastBuy.has(e.id)){ pnl += e.eth - lastBuy.get(e.id); pnlMatched++; }
      else pnlUnmatched++;
    }
    if(isSell) lastBuy.delete(e.id);
    if(isBuy){
      lastBuy.set(e.id, e.eth);
      if(e.ts >= cutoffTs && scoped){ bought++; spent += e.eth; }
    }
  }
  const held = _scHeldIds(wallet);
  const holds = held == null ? null : held.filter(inScope).length;
  // Gondi P2P swaps (NFTs on both sides -> no single price, so not on the
  // chart). Trades that were one NFT for ETH/WETH are already counted as
  // buys/sells above via the sales data ('gondi-trade').
  let swaps = 0;
  for(const t of (window._gondiTrades || [])){
    if(t.is_sale) continue;
    if(t.maker !== wallet && t.taker !== wallet) continue;
    const ts = t.executed_at ? Date.parse(t.executed_at) / 1000 : 0;
    if(ts < cutoffTs) continue;
    const ids = [...(t.maker_nfts || []), ...(t.taker_nfts || [])].map(x => parseInt(x.tokenId, 10)).filter(Number.isFinite);
    if(ids.some(inScope)) swaps++;
  }
  return { bought, sold, net: bought - sold, spent, received, pnl, pnlMatched, pnlUnmatched, holds, swaps };
}

function _scFmtEth(v){ return (Math.abs(v) >= 10 ? v.toFixed(2) : v.toFixed(3)).replace(/\.?0+$/, '') || '0'; }

function _scLegendHtml(hw, stats){
  if(!hw || !stats) return _SC_LEGEND_DEFAULT;
  const main = stats.trait || stats.overall;
  const holds = main.holds == null ? '…' : main.holds;
  const net = (main.net > 0 ? '+' : '') + main.net;
  const scope = stats.trait ? ' <span style="opacity:.75">(this trait)</span>' : '';
  const open = !!window._scStatsOpen;
  // jv: "I think it's a good touch" + (1) "The text on the bottom really
  // stretches it out... add like an 'i' button someone could tap that
  // would explain what they're looking at", (2) "I want that frosted glass
  // look to it so we can see the chart behind it", (3) "that panel pushes
  // that whole chart down including the hover display." So: the panel
  // FLOATS (absolute, over the chart) instead of taking layout space --
  // nothing below it moves -- is frosted/translucent, and the footnote is
  // behind an ⓘ toggle. Always rendered, shown/hidden by class, so
  // opening/closing is instant with no chart redraw.
  const line = `<span class="sc-stats-line" role="button" tabindex="0" aria-expanded="${open}" onclick="_scToggleStats(this)" onkeydown="if(event.key==='Enter')_scToggleStats(this)">`
    + `<span style="color:var(--tc-ffd76a);font-weight:700">●</span> Token `
    + `<span style="color:var(--tc-c9a9ff);font-weight:700">●</span> <b>${main.bought}</b> buys `
    + `<span style="color:var(--tc-f87171);font-weight:700">●</span> <b>${main.sold}</b> sells`
    + ` · Net <b>${net}</b> · Holds <b>${holds}</b>${scope} `
    + `<span class="sc-stats-btn">${open ? 'Details ▴' : 'Details ▸'}</span></span>`;
  const cols = stats.trait ? [['This trait', stats.trait], ['Overall', stats.overall]] : [['', stats.overall]];
  const pnlCell = st => {
    if(!st.pnlMatched) return '<span style="opacity:.7">–</span>';
    const c = st.pnl >= 0 ? 'var(--good, #22c55e)' : 'var(--tc-f87171)';
    return `<b style="color:${c}">${st.pnl >= 0 ? '+' : '−'}Ξ${_scFmtEth(Math.abs(st.pnl))}</b>`;
  };
  const rows = [
    ['Bought',       st => st.bought],
    ['Sold',         st => st.sold],
    ['Net',          st => (st.net > 0 ? '+' : '') + st.net],
    ['ETH spent',    st => 'Ξ' + _scFmtEth(st.spent)],
    ['ETH received', st => 'Ξ' + _scFmtEth(st.received)],
    ['Profit / loss',pnlCell],
    ['Holds now',    st => st.holds == null ? '…' : st.holds],
  ];
  if(cols.some(([,st]) => st.swaps > 0)) rows.push(['Gondi swaps', st => st.swaps]);
  const th = cols.map(([h]) => `<th style="text-align:right;font-weight:600;padding:0 0 4px 14px;color:var(--sub)">${h}</th>`).join('');
  const body = rows.map(([label, f]) => `<tr><td style="padding:2px 0;color:var(--sub)">${label}</td>${cols.map(([,st]) => `<td style="text-align:right;padding:2px 0 2px 14px;color:var(--text)">${f(st)}</td>`).join('')}</tr>`).join('');
  const unmatched = Math.max(...cols.map(([,st]) => st.pnlUnmatched || 0));
  const days = window._saleChartDays || 30;
  const rangeTxt = days >= 9999 ? 'all time' : days === 1 ? 'the last 24 hours' : days >= 365 ? 'the last year' : `the last ${days} days`;
  const info = `<b>Bought / Sold / Net / ETH</b> cover ${rangeTxt} (the chart's time range)`
    + (stats.trait ? ', for the selected trait and for everything this wallet traded.' : '.')
    + ` <b>Profit / loss</b> compares each sale with what this wallet paid for that same token, even if it bought it before this range`
    + (unmatched ? ` — ${unmatched} sale${unmatched===1?'':'s'} of tokens with no purchase on record (minted or received by transfer) aren't included.` : '.')
    + ` <b>Holds now</b> is what this wallet owns today.`
    + (cols.some(([,st]) => st.swaps > 0) ? ` <b>Gondi swaps</b> are trades with NFTs on both sides (no single price, so not shown as chart dots).` : '');
  const panel = `<div class="sc-stats-panel${open ? '' : ' sc-hidden'}">`
    + `<button type="button" class="sc-info-btn" aria-label="What am I looking at?" onclick="event.stopPropagation();this.closest('.sc-stats-panel').classList.toggle('sc-info-open')">i</button>`
    + `<table style="border-collapse:collapse;font-size:11px">${stats.trait ? `<tr><th></th>${th}</tr>` : ''}${body}</table>`
    + `<div class="sc-info-text">${info}</div></div>`;
  return `<span class="sc-stats-wrap">${line}${panel}</span>`;
}

// jv: "We essentially have 2 info bars... move the top info down to the
// bottom to the right of the wallet address. Slide the show and hide button
// all the way to the right... The details button can live in the area as
// well. Details will still display in the top left though." Fullscreen on
// phones, when the image strip is up: the top legend row (color key, or the
// wallet stats line with Details) moves into the strip header; the Details
// PANEL stays at the top-left. Runs before the plot's top margin is
// measured, so the chart takes the freed space.
function _scDockLegendInStrip(host){
  if(!host || host.id !== 'chartFullscreenHost') return;
  const slot = document.querySelector('#scGallery .scg-stats-slot');
  const desc = document.getElementById('chartFullscreenDescription');
  const on = document.getElementById('chartFullscreenOverlay')?.classList.contains('sc-gallery-on');
  if(!slot || !desc) return;
  slot.innerHTML = '';
  desc.classList.remove('sc-desc-docked');
  if(!on || !window._tvIsPhone()) return;
  // jv: "when it moves to the bottom it leaves a gap and the 'floor, all
  // sales, and selected' don't slide up" -- the emptied row kept its height
  // (it still holds the hidden Details panel), so the top bar and the plot's
  // top margin didn't shrink. Once docked, the row leaves the top bar's
  // layout (CSS .sc-desc-docked); the panel still opens under the controls.
  desc.classList.add('sc-desc-docked');
  const line = desc.querySelector('.sc-stats-line');
  if(line){ slot.appendChild(line); return; }             // stats line (+ Details); panel stays up top
  if(desc.textContent.trim()){                              // plain color key
    const key = document.createElement('span'); key.className = 'sc-legend-key';
    while(desc.firstChild) key.appendChild(desc.firstChild);
    slot.appendChild(key);
  }
}
function _scToggleStats(src){
  window._scStatsOpen = !window._scStatsOpen;
  const open = window._scStatsOpen;
  // The panel floats over the chart (no layout change), so just show/hide
  // it in every legend copy -- no chart redraw, zoom and tooltip untouched.
  document.querySelectorAll('#saleChartDescription .sc-stats-wrap, #chartFullscreenDescription .sc-stats-wrap').forEach(w => {
    w.querySelector('.sc-stats-panel')?.classList.toggle('sc-hidden', !open);
  });
  // the line (and its Details button) may live in the image strip now
  document.querySelectorAll('.sc-stats-line').forEach(l => {
    l.setAttribute('aria-expanded', String(open));
    const btn = l.querySelector('.sc-stats-btn'); if(btn) btn.textContent = open ? 'Details ▴' : 'Details ▸';
  });
}


// ── Token gallery beside the fullscreen Sale Chart (desktop only) ────────
// jv: "The token gallery isn't a bad idea for desktop on full screen only.
// I actually think it would look good there." A right-hand column inside
// the fullscreen overlay (the chart shrinks to fit, never covered):
//  - wallet highlighted -> that wallet's tokens, tagged B (bought) / S (sold)
//  - trait(s) selected  -> tokens that sold with the selected trait(s)
//  - otherwise          -> most recently sold tokens
// Newest first, capped. Tap a tile = select that token on the chart (its
// gold history path; keeps the highlighted wallet). Tap the selected tile
// again = open its token modal (same as double-tapping a dot). Selecting a
// dot on the chart outlines its tile and scrolls it into view.
try{ window._scgCollapsed = localStorage.getItem('scgCollapsed') === '1'; }catch(_){ window._scgCollapsed = false; }
function _scGalleryEnabled(host){
  // jv: "Can we try to add the images to mobile? Keep them small." ->
  // fullscreen on any screen, plus the normal Sale Chart tab on mobile.
  if(!host) return false;
  if(host.id === 'chartFullscreenHost') return true;
  // jv: "images arent there when sales chart is not in full screen. i want
  // to be like the mobile where they display for both views" -> the normal
  // Sale Chart tab shows the strip on desktop too.
  return host.id === 'saleChartHost';
}
// Gallery element for a host: inside the fullscreen overlay, or a strip
// right under the chart in the mobile Sale Chart tab.
function _scGalleryEl(host){
  if(host.id === 'chartFullscreenHost' || host.id === 'walletDeepDiveHost'){
    const overlay = document.getElementById('chartFullscreenOverlay');
    if(!overlay) return null;
    let g = document.getElementById('scGallery');
    if(!g){ g = document.createElement('div'); g.id = 'scGallery'; overlay.appendChild(g); }
    return g;
  }
  let g = document.getElementById('scGalleryTab');
  if(!g){ g = document.createElement('div'); g.id = 'scGalleryTab'; host.insertAdjacentElement('afterend', g); }
  return g;
}
// jv: "Clicking on a token image from the list crashed and reloaded the
// page." Token images are SVG data URIs (URL-encoded SVG, often tens of KB
// each). The gallery cached those full strings and pasted them into its
// innerHTML for every cached card on EVERY rebuild -- and selecting a token
// rebuilt it (more than once). After scrolling a trait's images, one tap
// built multi-megabyte HTML strings repeatedly -> iOS killed the tab.
// Now: each image is converted ONCE to a short blob: URL (bounded cache,
// oldest revoked), images are set on the <img> element (never written into
// HTML), and an unchanged item list only moves the selection (see
// _scRenderGallery).
const _SCG_IMG_MAX = 400;
function _scgImgUrl(src){
  if(!src || !src.startsWith('data:image/svg+xml')) return src || '';
  try{
    const comma = src.indexOf(',');
    const meta = src.slice(0, comma), body = src.slice(comma + 1);
    const svg = /;base64/i.test(meta) ? atob(body) : decodeURIComponent(body);
    return URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  }catch(_){ return src; }
}
function _scgCacheSet(cache, id, url){
  cache.set(id, url);
  while(cache.size > _SCG_IMG_MAX){
    const [oldId, oldUrl] = cache.entries().next().value;
    cache.delete(oldId);
    if(oldUrl && oldUrl.startsWith('blob:')){
      // Only revoke if no card on screen still shows it.
      if(!document.querySelector(`[data-scg-id="${oldId}"] img[src="${oldUrl}"]`)) URL.revokeObjectURL(oldUrl);
    }
  }
}
// Mark the selected tile + its × without rebuilding the gallery.
// Replay a dot tap for token `id` (its most recent sale) on `host`.
// Returns false if the token has no sale in the loaded data.
function _scTapTokenDot(host, id){
  let best = null;
  for(const e of (window._floorEvents || [])){
    if(+e?.nft?.identifier !== id) continue;
    if(!best || (e.closing_date || 0) > (best.closing_date || 0)) best = e;
  }
  if(!best || typeof host.emit !== 'function') return false;
  const ts = best.closing_date;
  let eth = null;
  try{ eth = Number(BigInt(best.payment?.quantity || '0')) / Math.pow(10, best.payment?.decimals ?? 18); }catch(_){}
  if(!(eth > 0)) return false;
  const isWeth = (best.payment?.symbol || '') === 'WETH';
  const cd = { id, kind: 'bg', ts, eth, isWeth, walletDot: !!window._saleChartHighlightWallet };
  // Screen position of that dot (clamped into the plot area if it's
  // outside the current zoom), for where the preview appears.
  const r = host.getBoundingClientRect();
  let x = r.left + r.width / 2, y = r.top + r.height / 2;
  try{
    const xa = host._fullLayout.xaxis, ya = host._fullLayout.yaxis;
    const px = xa.l2p(xa.d2l(ts * 1000)), py = ya.l2p(ya.d2l(eth));
    x = r.left + xa._offset + Math.max(0, Math.min(xa._length, px));
    y = r.top + ya._offset + Math.max(0, Math.min(ya._length, py));
  }catch(_){}
  host.emit('plotly_click', { points: [{ customdata: cd }], event: { clientX: x, clientY: y } });
  return true;
}
function _scgApplySelection(g, anchor){
  g.querySelectorAll('.scg-tile.scg-on').forEach(t => { t.classList.remove('scg-on'); t.querySelector('.scg-unselect')?.remove(); });
  const t = anchor != null ? g.querySelector(`.scg-tile[data-scg-id="${anchor}"]`) : null;
  if(t){
    t.classList.add('scg-on');
    const box = t.querySelector('.scg-img');
    if(box && !box.querySelector('.scg-unselect')){
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'scg-unselect'; b.textContent = '×';
      b.setAttribute('aria-label', `Unselect #${anchor}`); b.title = 'Back to the full list';
      box.appendChild(b);
    }
    t.scrollIntoView({ block:'nearest', inline:'center' });
  }
}

function _scRenderGallery(host, title, items){
  // jv: bottom strip of token images (trait filter / trait count / wallet).
  // Follow-ups: "add the dots underneath the images. No letters" (colored
  // dot + count: purple = buys, red = sells, like the chart), "Make the
  // images a size smaller. Don't round the corners." Images lazy-load via
  // _getTokenImgSrcAsync as cards scroll into view (the sync grid lookup
  // only knows tokens whose data chunk the grid already loaded).
  const g = _scGalleryEl(host);
  if(!g) return;
  g.dataset.hostId = host.id;
  g.style.display = '';
  if(!g._scClick){
    g._scClick = true;
    const _handle = e => {
      const hostId = g.dataset.hostId || 'chartFullscreenHost';
      // jv: "the option to minimize the token image bar and bring it back up"
      // jv: "Clicking the show images button isn't registering. It's acting as
      // if I'm clicking a dot on the chart." The label was a 15px-tall target
      // at the chart's edge; near-misses landed on the chart (which snaps a
      // tap to the nearest dot). Now the whole header row -- and the whole
      // bar when collapsed -- toggles.
      // The docked stats row (color key / wallet stats + Details) lives in the
      // header: its taps belong to Details, never to Hide/Show.
      if(e.target.closest('.scg-stats-slot')){
        // handled on the touch itself; cancel the follow-up click so the line's
        // own onclick doesn't toggle it straight back
        if(e.type === 'touchend' && e.target.closest('.sc-stats-line')){ e.preventDefault(); _scToggleStats(); }
        return;
      }
      if(e.target.closest('[data-scg-toggle]') || e.target.closest('.scg-head') || g.classList.contains('scg-collapsed')){
        window._scgCollapsed = !window._scgCollapsed;
        try{ localStorage.setItem('scgCollapsed', window._scgCollapsed ? '1' : '0'); }catch(_){}
        const h = document.getElementById(hostId);
        if(h && h.offsetWidth > 0){ if(typeof h._scgRerender === 'function') h._scgRerender(); else renderSaleChart(hostId); }
        return;
      }
      // jv: "there is no way to un click that image to get back to the display
      // of filtered images" -- the selected tile's × restores exactly what
      // was shown before selecting (same snapshot/restore as the chart
      // preview's ×): tap = select, tap again = open, × = back.
      if(e.target.closest('.scg-unselect')){ e.stopPropagation(); _saleChartClosePreview(hostId); return; }
      const t = e.target.closest('[data-scg-id]');
      if(!t) return;
      const id = +t.dataset.scgId;
      // jv: "when clicking a token image [it] should act as if I'm tapping the
      // dot and bring up the hover display of the token." Replay the exact
      // dot tap (same plotly_click the chart fires), positioned at the
      // token's most recent sale -- preview, wallet handling and 'tap again
      // to open' all come from the one real code path.
      const host = document.getElementById(hostId);
      // Wallet History has its own tile tap (replays that chart's dot tap)
      if(host && typeof host._scgTap === 'function'){ host._scgTap(id); return; }
      if(host && _scTapTokenDot(host, id)) return;
      // Never sold in the loaded data (no dot): select only; tap again opens.
      if(window._saleChartAnchor === id){ _scForgetPreTap(); if(typeof openModal === 'function') openModal(id); return; }
      if(host && !host._scPreTap) host._scPreTap = { anchor: window._saleChartAnchor, wallet: window._saleChartHighlightWallet };
      setSaleChartAnchor(id, hostId, !!window._saleChartHighlightWallet);
    };
    // jv: "The whole image bar, show and hide buttons are still unresponsive
    // until I bring up ... the token modal ... and close it." On iPhone the
    // click that follows a tap can be cancelled by other touch handling on
    // the page (the tap log showed touchstart/touchend on the button but no
    // click). React to the touch itself: a finger lift within 10px of where
    // it went down is a tap (a sideways scroll of the row is not); the
    // synthetic click that may follow is then ignored so nothing runs twice.
    let _t0 = null;
    g.addEventListener('touchstart', e => { const t = e.touches[0]; _t0 = e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null; }, { passive: true });
    g.addEventListener('touchend', e => {
      const t = e.changedTouches[0]; const s0 = _t0; _t0 = null;
      if(!s0 || !t || Math.hypot(t.clientX - s0.x, t.clientY - s0.y) > 10) return;
      g._scgTouchTs = Date.now();
      _handle(e);
    });
    g.addEventListener('click', e => { if(Date.now() - (g._scgTouchTs || 0) < 700) return; _handle(e); });
  }
  const anchor = host._scgAnchor !== undefined ? host._scgAnchor : window._saleChartAnchor;
  const cache = window._scgImgCache || (window._scgImgCache = new Map());
  // Same list as last time (e.g. only the selected token changed): just
  // move the selection -- no rebuild, no re-created images.
  const collapsed = !!window._scgCollapsed;
  g.classList.toggle('scg-collapsed', collapsed);
  const sig = (collapsed ? 'C|' : 'O|') + title + '|' + (items._total ?? items.length) + '|' + items.map(it => `${it.id}:${it.buys||0}:${it.sells||0}:${it.listed ?? ''}`).join(',');
  if(g._scgSig === sig && g.querySelector('.scg-row')){
    _scgApplySelection(g, anchor);
    return;
  }
  g._scgSig = sig;
  const cards = items.map(it => {
    const price = it.listed != null
      ? `<span class="scg-price">Ξ${_scFmtEth(it.listed)}</span>`
      : (it.last != null ? `<span class="scg-last">Ξ${_scFmtEth(it.last)}</span>` : '');
    // jv: "Get rid of the dots... I much rather just have the full clean image
    // display with nothing overtop, above or beneath them." No buy/sell
    // badges and no text on the tiles; number/price stay in the hover title.
    const counts = false && (it.buys || it.sells)
      ? `<div class="scg-counts">${it.buys ? `<span class="scg-cnt scg-cnt-b"><i></i>${it.buys}</span>` : ''}${it.sells ? `<span class="scg-cnt scg-cnt-s"><i></i>${it.sells}</span>` : ''}</div>` : '';
    const tip = `#${it.id}` + (it.buys ? ` · ${it.buys} buy${it.buys===1?'':'s'}` : '') + (it.sells ? ` · ${it.sells} sell${it.sells===1?'':'s'}` : '');
    const unselect = it.id === anchor ? `<button type="button" class="scg-unselect" aria-label="Unselect #${it.id}" title="Back to the full list">×</button>` : '';
    return `<div class="scg-tile${it.id === anchor ? ' scg-on' : ''}" data-scg-id="${it.id}" title="${tip}">`
      + `<div class="scg-img"><img data-scg-lazy="1" alt="#${it.id}" decoding="async">${unselect}</div>`
      + `</div>`;
  }).join('');
  g.innerHTML = `<div class="scg-head"><span class="scg-title">${title}</span><span class="scg-count">ITEMS (${items._total ?? items.length})</span>`
    + `<span class="scg-sort">${collapsed ? '' : (items._sortLabel || '')}</span>`
    + `<span class="scg-stats-slot"></span>`
    + `<button type="button" class="scg-toggle" data-scg-toggle aria-expanded="${!collapsed}">${collapsed ? '▴ Show images' : '▾ Hide'}</button></div>`
    + (collapsed ? '' : (items.length ? `<div class="scg-row">${cards}</div>` : `<div class="scg-empty">No tokens to show</div>`));
  const row = g.querySelector('.scg-row');
  if(row){
    if(g._io) g._io.disconnect();
    g._io = new IntersectionObserver(entries => {
      for(const en of entries){
        if(!en.isIntersecting) continue;
        const img = en.target; g._io.unobserve(img);
        const id = +img.closest('[data-scg-id]').dataset.scgId;
        if(cache.has(id)){ img.src = cache.get(id); continue; }
        // jv: Argonauts chart images "did not [load], I had to restart the
        // app". If the collection's data wasn't loaded yet, the lookup
        // returned nothing -- no URL means no error event, so no retry, and
        // the tile stayed blank. Try again (up to ~20s) until it resolves.
        const attempt = k => {
          if(!img.isConnected) return;
          const set = src => {
            if(!img.isConnected) return;
            if(!src){ if(k < 8) setTimeout(() => attempt(k + 1), 1000 + k * 500); return; }
            const url = _scgImgUrl(src); _scgCacheSet(cache, id, url); img.src = url;
          };
          if(typeof _getTokenImgSrcAsync === 'function') Promise.resolve(_getTokenImgSrcAsync(id)).then(set).catch(() => set(null));
          else { try{ set(VS._imgSrc(id)); }catch(_){ set(null); } }
        };
        attempt(0);
      }
    }, { root: row, rootMargin: '0px 300px 0px 300px' });
    row.querySelectorAll('img[data-scg-lazy]').forEach(img => g._io.observe(img));
    const on = row.querySelector('.scg-on');
    if(on) on.scrollIntoView({ block:'nearest', inline:'center' });
  }
}
function _scHideGallery(which){
  if(which !== 'tab') document.getElementById('chartFullscreenOverlay')?.classList.remove('sc-gallery-on', 'sc-gallery-min');
  if(which !== 'fullscreen'){ const t = document.getElementById('scGalleryTab'); if(t) t.style.display = 'none'; }
  if(which) return;
}

// jv: "There's way too many Eth prices on that axis now. In between the
// top price and the floor, there should only be about 4 - 5 prices and
// we don't need .000 after each number. Just have full numbers 1, 2, 3."
// Plotly's log axis labels every 1-9 step per decade once dtick is
// unset. Explicit ticks instead: round "nice" values (1/2/3/5 x 10^k)
// inside the visible range, thinned to ~5 spread evenly in log space;
// labels are plain numbers (whole numbers >= 1, e.g. 0.2 / 0.05 below).
// lo/hi are log10 values, i.e. the log axis's own range units.
function _scLogTicks(llo, lhi){
  const lo = Math.pow(10, llo), hi = Math.pow(10, lhi);
  const cands = [];
  for(let k = Math.floor(llo) - 1; k <= Math.ceil(lhi) + 1; k++){
    for(const m of [1,2,3,5]){
      const v = +(m * Math.pow(10, k)).toPrecision(3);
      if(v >= lo && v <= hi && !cands.includes(v)) cands.push(v);
    }
  }
  const target = 5;
  let vals = [];
  if(cands.length <= target) vals = cands.slice();
  else {
    for(let i = 0; i < target; i++){
      const t = llo + (lhi - llo) * (i + 0.5) / target;
      // slight preference for 1 / 10 / 0.1-style anchors so they show when in range
      const cost = c => Math.abs(Math.log10(c) - t) - (Math.abs(Math.log10(c) % 1) < 1e-9 ? 0.15 : 0);
      let best = cands[0];
      for(const c of cands) if(cost(c) < cost(best)) best = c;
      if(!vals.includes(best)) vals.push(best);
    }
  }
  if(vals.length < 2){ // very narrow (zoomed-in) range: evenly spaced, 2 significant digits
    vals = [];
    for(let i = 0; i < 4; i++){
      const r = +Math.pow(10, llo + (lhi - llo) * (i + 0.5) / 4).toPrecision(2);
      if(!vals.includes(r)) vals.push(r);
    }
  }
  vals.sort((a,b) => a - b);
  const fmt = v => v >= 10 ? String(Math.round(v)) : String(+v.toPrecision(2));
  return { tickmode:'array', tickvals: vals, ticktext: vals.map(fmt) };
}

// jv: "the pinch to zoom and zoom out is not smooth at all. It should
// scale as I am pinching and vice versa." Plotly.js has no continuous
// touch pinch -- its own handling resolves the gesture after the fact,
// hence the jumpy feel. Replaced for the Sale Chart with a native
// two-finger handler: every animation frame while fingers move, both
// axes are rescaled by (start finger distance / current distance),
// anchored so the data point that started between your fingers stays
// between them (which also gives two-finger panning for free). Only
// cheap axis-range relayouts per frame, never a full re-render. Capture
// phase + stopPropagation on 2-finger events so neither the browser's
// page zoom nor Plotly's own drag handling fights it; one-finger
// gestures pass through untouched. Bound natively (not via host.on), so
// it survives Plotly.purge() and only needs binding once per host.
// Zoomed/panned -> offer '↺ Reset' right away (the controls are only rebuilt
// on a full redraw, which pinching/panning deliberately avoids).
function _scOfferReset(host){
  const barId = host.classList.contains('chart-fullscreen-host') ? 'chartFullscreenTopControls' : (host.id === 'saleChartHost' ? 'saleChartTopControls' : null);
  const bar = barId && document.getElementById(barId);
  if(bar && !bar.querySelector('.sc-reset-btn')){
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'sc-reset-btn'; b.textContent = '↺ Reset';
    b.title = 'Clear the selected token, wallet and zoom';
    b.onclick = () => (typeof host._scResetFn === 'function' ? host._scResetFn() : _saleChartReset(host.id));
    bar.appendChild(b);
  }
}
function _scBindPinch(host){
  if(host._scPinchBound) return;
  host._scPinchBound = true;
  // Keep the drawing the same size as its box. On iPhone, rotating to
  // landscape resizes the viewport after the chart drew; the stale, taller
  // drawing spilled over the image bar and swallowed taps meant for it.
  if(typeof ResizeObserver === 'function'){
    let t = null, lastW = 0, lastH = 0;
    new ResizeObserver(entries => {
      const r = entries[0] && entries[0].contentRect; if(!r) return;
      const w = Math.round(r.width), h = Math.round(r.height);
      if(!w || !h || (w === lastW && h === lastH)) return;
      lastW = w; lastH = h;
      clearTimeout(t);
      // (layout has explicit width/height, so Plots.resize alone would no-op)
      t = setTimeout(() => { try{ if(host._fullLayout && (host._fullLayout.width !== w || host._fullLayout.height !== h)) Plotly.relayout(host, { width: w, height: h }); }catch(_){} }, 120);
    }).observe(host);
  }
  let st = null, raf = 0, pending = null;
  const dist = (a,b) => Math.hypot(a.clientX-b.clientX, a.clientY-b.clientY);
  const mid  = (a,b) => ({x:(a.clientX+b.clientX)/2, y:(a.clientY+b.clientY)/2});
  const flush = () => {
    raf = 0;
    if(!pending) return;
    const p = pending; pending = null;
    // (log tick labels only on a log axis -- Wallet History's ETH axis is linear)
    const isLog = host._fullLayout?.yaxis?.type === 'log';
    const tk = isLog ? _scLogTicks(p.y[0], p.y[1]) : null;
    try{ Plotly.relayout(host, tk ? {'xaxis.range':p.x, 'yaxis.range':p.y, 'yaxis.tickmode':tk.tickmode, 'yaxis.tickvals':tk.tickvals, 'yaxis.ticktext':tk.ticktext} : {'xaxis.range':p.x, 'yaxis.range':p.y}); }catch(e){}
  };
  // jv: "can the full screen chart support tap and drag with one finger to
  // move the chart up and down or left and right?" Fullscreen only (in the
  // tab, one finger scrolls the page). A drag starts after 8px of movement
  // so taps still select dots; the lift after a drag is ignored as a tap.
  let pan = null;
  const panAxes = () => {
    const fl = host._fullLayout; const xa = fl?.xaxis, ya = fl?.yaxis;
    return (xa?.range && ya?.range && xa._length && ya._length) ? { xa, ya } : null;
  };
  host.addEventListener('touchstart', e => {
    if(e.touches.length !== 1 || !host.classList.contains('chart-fullscreen-host') || st) return;
    const ax = panAxes(); if(!ax) return;
    pan = { x: e.touches[0].clientX, y: e.touches[0].clientY, active: false, ...ax,
      x0: ax.xa.range.map(v => ax.xa.r2l(v)), y0: ax.ya.range.map(v => ax.ya.r2l(v)) };
  }, {capture:true, passive:true});
  host.addEventListener('touchmove', e => {
    if(!pan || e.touches.length !== 1) return;
    const dx = e.touches[0].clientX - pan.x, dy = e.touches[0].clientY - pan.y;
    if(!pan.active){ if(Math.hypot(dx, dy) < 8) return; pan.active = true; _hideChartTooltip && _hideChartTooltip('_saleChartTT'); }
    e.preventDefault(); e.stopPropagation();
    const wX = pan.x0[1] - pan.x0[0], wY = pan.y0[1] - pan.y0[0];
    const nx0 = pan.x0[0] - dx / pan.xa._length * wX;
    const ny0 = pan.y0[0] + dy / pan.ya._length * wY;   // screen y grows downward
    pending = { x: [pan.xa.l2r(nx0), pan.xa.l2r(nx0 + wX)], y: [pan.ya.l2r(ny0), pan.ya.l2r(ny0 + wY)] };
    host._scZoomRanges = { x: pending.x.slice(), y: pending.y.slice() };
    if(!raf) raf = requestAnimationFrame(flush);
  }, {capture:true, passive:false});
  const panEnd = e => {
    if(!pan) return;
    const was = pan.active; pan = null;
    // (no stopPropagation: Plotly must see the lift to end its own gesture
    // tracking -- otherwise it keeps cancelling later touches page-wide, which
    // killed taps on the image bar until something reset it)
    if(was){ host._scPinchEndTs = Date.now(); _scOfferReset(host); }
  };
  host.addEventListener('touchend', panEnd, {capture:true, passive:false});
  host.addEventListener('touchcancel', panEnd, {capture:true, passive:false});

  host.addEventListener('touchstart', e => {
    if(e.touches.length !== 2) return;
    pan = null; // a second finger turns a pan into a pinch
    const fl = host._fullLayout;
    const xa = fl?.xaxis, ya = fl?.yaxis;
    if(!xa?.range || !ya?.range || !xa._length || !ya._length) return;
    e.preventDefault(); e.stopPropagation();
    const r = host.getBoundingClientRect();
    const m = mid(e.touches[0], e.touches[1]);
    const x0 = xa.range.map(v => xa.r2l(v)), y0 = ya.range.map(v => ya.r2l(v));
    const fx = (m.x - r.left - xa._offset) / xa._length;
    const fy = 1 - (m.y - r.top - ya._offset) / ya._length;
    st = {
      d0: Math.max(10, dist(e.touches[0], e.touches[1])),
      x0, y0, r, xa, ya,
      xOff: xa._offset, xLen: xa._length, yOff: ya._offset, yLen: ya._length,
      // data coordinates that sat under the fingers' midpoint at start
      cX: x0[0] + fx*(x0[1]-x0[0]),
      cY: y0[0] + fy*(y0[1]-y0[0])
    };
    host._scPinching = true;
    _hideChartTooltip && _hideChartTooltip('_saleChartTT');
  }, {capture:true, passive:false});
  host.addEventListener('touchmove', e => {
    if(!st || e.touches.length !== 2) return;
    e.preventDefault(); e.stopPropagation();
    const s = Math.min(20, Math.max(0.02, st.d0 / Math.max(10, dist(e.touches[0], e.touches[1]))));
    const m = mid(e.touches[0], e.touches[1]);
    const fx = (m.x - st.r.left - st.xOff) / st.xLen;
    const fy = 1 - (m.y - st.r.top - st.yOff) / st.yLen;
    const wX = (st.x0[1]-st.x0[0]) * s, wY = (st.y0[1]-st.y0[0]) * s;
    const nx0 = st.cX - fx*wX, ny0 = st.cY - fy*wY;
    pending = {
      x: [st.xa.l2r(nx0), st.xa.l2r(nx0 + wX)],
      y: [st.ya.l2r(ny0), st.ya.l2r(ny0 + wY)]
    };
    host._scZoomRanges = { x: pending.x.slice(), y: pending.y.slice() };
    if(!raf) raf = requestAnimationFrame(flush);
  }, {capture:true, passive:false});
  const end = e => {
    if(!st) return;
    if(e.touches.length < 2){
      st = null;
      host._scPinching = false;
      host._scPinchEndTs = Date.now();
      _scOfferReset(host);   // (lift not hidden from Plotly -- see pan end)
    }
  };
  host.addEventListener('touchend', end, {capture:true, passive:false});
  host.addEventListener('touchcancel', end, {capture:true, passive:false});
}

// The shared trait picker's handlers all redraw via renderSaleChart(hostId);
// for a Floor Trend host, redraw the Floor Trend instead.
function _floorHostId(id){ return id === 'floorTrendHost' || id === 'floorFullscreenHost'; }
function renderSaleChart(hostId){
  if(_floorHostId(hostId)){ _floorRerenderVisible(); return; }
  const _C = _chartPalette(); // theme-aware highlight colors (see _chartPalette)
  const host = document.getElementById(hostId || 'saleChartHost');
  if(!host) return;
  // jv: "when closing out of the full screen view of the chart and going
  // back to regular view... I am unable to close the analytics tab. It
  // bugs out. I have to refresh the page." Root cause: the zero-width
  // retry further down this function (for a tab that isn't laid out yet
  // on the tick it's switched to) retried EVERY animation frame with no
  // limit -- and only after first rebuilding the whole trait-picker
  // HTML. Once fullscreen closed, its host is display:none forever, so
  // any render aimed at it (a queued anchor re-render, a resize,
  // _saleChartRerenderBoth syncing the other copy) spun a permanent
  // 60fps DOM-rebuild loop that locked up the page. Now: checked first,
  // before any DOM work; a host that's genuinely hidden (no layout box
  // at all) is skipped outright -- whatever shows it later (tab switch,
  // opening fullscreen) renders it then -- and the layout-race retry is
  // capped at ~0.5s of frames.
  if(typeof Plotly === 'undefined'){ window.ensurePlotly && window.ensurePlotly(); setTimeout(()=>renderSaleChart(hostId), 80); return; }
  if(host.offsetWidth === 0){
    const hidden = host.getClientRects().length === 0;
    host._scWaitFrames = (host._scWaitFrames || 0) + 1;
    if(!hidden && host._scWaitFrames <= 30) requestAnimationFrame(()=>renderSaleChart(hostId));
    else host._scWaitFrames = 0;
    return;
  }
  host._scWaitFrames = 0;
  // jv: "Sales chart against the light theme needs some work with the
  // colors theme. Almost blends in with the greyish background." The
  // default (non-highlighted) wallet-connection line and the dimmed
  // dot color below were both hardcoded near-white/mid-grey at low
  // opacity -- fine against this app's usual dark themes, but nearly
  // invisible against a light one. Computed here (ahead of where the
  // theme's own text color is otherwise read further down this same
  // function, for the layout) so the trace-building below can use it
  // too: based on var(--sub), which every theme already tunes to
  // contrast against its own background, rather than a fixed color
  // that only works for one theme.
  const _scSubColor = getComputedStyle(document.body).getPropertyValue('--sub').trim() || '#7a8fa8';
  // jv: "A very sleek way to filter through different traits to see a
  // more in depth plot chart view of sales per trait." Fullscreen has no
  // access to the sidebar's own trait chips, so it needs its own picker;
  // the normal tab gets the same picker too (match-any/all, minimum
  // wallet-purchase threshold, and wallet search are new controls that
  // exist nowhere else, not even the sidebar) -- just into its own
  // separate controls slot. Rebuilt fresh on every render. jv: "The
  // sales chart filter tab should only filter within the sales chart,
  // not the entire page" -- this picker's own selections now live in
  // window._saleChartActiveTraits, a Map separate from the sidebar/
  // grid's own activeTraits, rather than only once on open.
  const controlsSlotId = host.id === 'chartFullscreenHost' ? 'chartFullscreenControls' : 'saleChartTabControls';
  const controls = document.getElementById(controlsSlotId);
  const _picker = _buildSaleChartTraitPickerHtml(host.id);
  if(host.id === 'chartFullscreenHost'){
    // jv: "Theres text hidden behind the filters now. It should be
    // moved to the right of the wallet address look up and also the
    // selected trait fills and wallet address pill can be moved there
    // as well. No text overlapping." Splitting topHtml/bottomHtml/
    // description across the topbar and a separately-positioned row
    // below kept landing on top of Plotly's own in-chart legend and
    // axis labels once the topbar's real height didn't match what the
    // controls row's offset assumed. Simplest fix: everything (range +
    // trait + search + match mode + wallet-highlight chip + active
    // trait chips) now lives in the one topbar row, in that order, with
    // nothing separately positioned below it to potentially drift out
    // of sync and overlap the chart -- the topbar's own flex-wrap
    // still wraps this onto extra lines if it doesn't fit, same as
    // before, it just no longer has a second, independently-positioned
    // element to also account for.
    const topControls = document.getElementById('chartFullscreenTopControls');
    if(topControls) topControls.innerHTML = _picker.topHtml + _picker.bottomHtml;
    if(controls) controls.innerHTML = '';
  } else {
    // jv: "i think i want this on mobile as well" -- originally desktop
    // -only (!window._tvIsPhone()), mobile kept everything in the
    // single row below. Now unconditional: topHtml (trait dropdown +
    // wallet search) always goes up beside the day-range buttons,
    // bottomHtml (match mode, wallet-highlight chip, active trait
    // chips) always stays below -- the day-range row already wraps
    // (flex-wrap) if it doesn't all fit on one line at narrow widths,
    // same as it always has.
    if(controls) controls.innerHTML = _picker.bottomHtml;
    const topControls = document.getElementById('saleChartTopControls');
    if(topControls) topControls.innerHTML = _picker.topHtml;
  }
  // jv: "when in landscape that color description should show at the
  // very top of the page." Populated only for Sale Chart's own
  // fullscreen host -- wallet deep-dive's fullscreen reuses the same
  // overlay/topbar but has no trait-color legend of its own to show,
  // so this stays empty (and the topbar renders as a single line)
  // whenever that's what's showing instead.
  if(host.id === 'chartFullscreenHost'){
    const descEl = document.getElementById('chartFullscreenDescription');
    if(descEl) descEl.innerHTML = '<span style="color:var(--tc-ffd76a);font-weight:700">●</span> Token\'s history <span style="color:var(--tc-c9a9ff);font-weight:700">●</span> Wallet buys <span style="color:var(--tc-f87171);font-weight:700">●</span> Wallet sells';
  }
  // Same two races renderFloorTrend() already guards against: Plotly not
  // finished loading yet, and the tab panel not actually laid out yet
  // (zero-width container) on the same tick it's switched to. Preserve
  // hostId on retry -- a bare re-call here would silently fall back to
  // the default host and never render into a fullscreen target.
  // (Plotly-loaded / zero-width readiness checks moved to the top of
  // this function -- see the freeze fix there.)

  const events = window._floorEvents;
  if(!events || !events.length){
    host.innerHTML = '<div class="sc-empty-msg" style="color:var(--sub);font-size:12px;padding:20px 0">No sales data yet.</div>';
    return;
  }

  const days = window._saleChartDays;
  const cutoff = Date.now()/1000 - days*86400;

  // Parse events into the same shape renderFloorTrend() uses -- kept as
  // its own copy rather than a shared extraction, so a future edit to
  // either chart's parsing can't accidentally regress the other.
  const allSales = [];
  // jv: "the trait filter dropdown is still grey. heres the console" --
  // console showed "TypeError: Assignment to constant variable" at the
  // reassignment below (line ~9409). The earlier community fix (from a
  // different chat) correctly moved this declaration out here, above
  // the try block, so it's visible to host._saleChartState further
  // down -- but declared it const, and the inner line still needs to
  // REASSIGN it to a fresh empty Map on every render (not just mutate
  // the same one via .set()), which const doesn't allow. Every render
  // that reached this line threw immediately, aborting the entire rest
  // of the matching/trace-building section (everything after it, which
  // is most of it) silently into the catch -- explaining why even
  // filters with genuine matches (confirmed by the trait-floor bar
  // still showing real data underneath, since THAT reads a separate,
  // unrelated code path) never actually got their dots drawn. let,
  // not const.
  let walletTokenIdsByAddr = new Map(); // for the richer wallet info below
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
      const sym = ev.payment?.symbol||'';
      if(sym === 'TRANSFER') continue;
      const addr = (ev.payment?.address||ev.payment?.token_address||'').toLowerCase();
      const isWeth = sym.toUpperCase()==='WETH' || (addr === '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2');
      allSales.push({ ts, eth, id, rank, isWeth,
        seller: ev.seller||'', buyer: ev.buyer||'', marketplace: ev.marketplace || null,
        date: new Date(ts*1000) });
    }catch{}
  }

  if(!allSales.length){
    host.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:20px 0">No sales in this time range.</div>';
    return;
  }
  allSales.sort((a,b)=>a.ts-b.ts);

  // Daily floor line -- same computation renderFloorTrend() uses, shown
  // here only as light context underneath the trait comparison, not the
  // main focus of this chart.
  // jv: "On chain all stars chart doesn't reflect when a trait is
  // selected... the dots get stuck at the top of the chart." Part of the
  // cause: the floor was each day's raw MINIMUM sale, so one near-zero
  // dust/junk sale (0.00002, 0.000002 in jv's screenshot) dragged that
  // day's floor down by orders of magnitude, and the y-axis stretched to
  // reach it -- squashing every real sale against the top. Floor now =
  // lowest sale that's at least 20% of that day's median, which ignores
  // dust but still tracks genuine cheap sales.
  const dayPrices = {};
  for(const s of allSales){
    if(s.isWeth || !(s.eth > 0)) continue;
    const key = s.date.toISOString().slice(0,10);
    (dayPrices[key] = dayPrices[key] || []).push(s.eth);
  }
  // Sale -> marketplace lookup for the tooltip (only non-OpenSea sales).
  window._scMarketplaceBySale = new Map();
  for(const sl of allSales) if(sl.marketplace) window._scMarketplaceBySale.set(`${sl.id}|${sl.ts}`, sl.marketplace);

  const byDay = {};
  for(const [key, arr] of Object.entries(dayPrices)){
    arr.sort((a,b)=>a-b);
    const median = arr[Math.floor(arr.length/2)];
    byDay[key] = arr.find(v => v >= median * 0.2) ?? median;
  }
  const floorDays = Object.keys(byDay).sort();
  const floorTrace = {
    x: floorDays.map(d=>new Date(d)), y: floorDays.map(d=>byDay[d]),
    mode:'lines', type:'scattergl', name:'Floor',
    line:{color:rgbaFromHex(_scSubColor, .55), width:1, dash:'dot'},
    hoverinfo:'skip'
  };

  // Background layer -- every sale in range. jv: "when filtering a trait,
  // we should only be viewing those sales on the chart and not all sales
  // just to keep the chart less cluttered on mobile" -- once any trait
  // (or trait-count) filter is active, this layer hides rather than just
  // dimming further; only the matched/highlighted sales (plus the floor
  // line for context) show.
  const anyTraitFilterActive = window._saleChartActiveTraits.size > 0
    || (typeof window._saleChartTraitCount !== 'undefined' && window._saleChartTraitCount !== null);
  const bgTrace = {
    x: allSales.map(s=>s.date), y: allSales.map(s=>s.eth),
    mode:'markers', type:'scattergl', name:'All Sales',
    // jv: "these dots all grouped up look super dull. I much prefer the way
    // the floor trends dots look and that they are hollow and not filled."
    // Hollow teal rings (like the Floor Trend): dense stretches read as a
    // lacy band instead of a solid gray mass, and the solid highlighted dots
    // (token / wallet / traits) stand out against them.
    // jv: "The sales chart rings can go back to being filled instead of
    // hollow. Make them 2 shades darker and the dots just a size smaller."
    // -> filled, size 6 -> 4, dark themes .11 -> .09 (.07 made lone sales
    // nearly invisible; smaller filled dots are already darker). Highlighted dots
    // (traits 7-10, wallet 14, selected 19) are separate traces drawn on
    // top, so they stay big and tappable.
    marker:{ size:4, symbol:'circle', line:{ width:0 },
             // jv: "I don't like the color of the dots... White is fine. Or like a
             // soft white" -> soft white rings (soft charcoal on Minimal Light).
             // jv: "1 more shade darker on the dots... And on the light theme the
             // darks are too dark" -> .26 -> .15 on dark themes (grouped rings were too bright); .32 -> .10 on light (grouped black rings too heavy).
             // jv: "too bright when grouped" -> tried muted gray-green, didn't like it:
             // "Go back to the color it was before the muted gray green and just go a
             // shade darker" -> soft white again, .15 -> .11 on dark themes.
             // Minimal Light unchanged at .10 (the brightness issue is dark-theme only).
             color: document.documentElement.getAttribute('data-theme') === 'minimal-light' ? 'rgba(24,24,27,.10)' : 'rgba(235,238,245,.09)' },
    hovertemplate:' <extra></extra>',
    customdata: allSales.map(s=>({id:s.id, kind:'bg', ts:s.ts, eth:s.eth, isWeth:s.isWeth})),
    // jv: "on desktop when closing a trait the chart doesn't load back
    // up properly" -- this trace used to be OMITTED from the traces
    // array entirely whenever a filter was active, meaning every trace
    // after it shifted to a different array index between renders.
    // Plotly.react() matches traces by position primarily, so a legend
    // click (a mouse-driven interaction, much more natural on desktop
    // than on a touchscreen) toggling one trace's visibility could leak
    // onto a completely different trace the next time this ran with a
    // different filter state and a different trace count. Kept
    // permanently in the array at a fixed position now, toggled with
    // its own `visible` property instead -- same visual result, no
    // trace ever changes array position between renders.
    visible: anyTraitFilterActive ? false : true
  };

  const traces = [floorTrace, bgTrace];

  // One colored, connected series per active trait filter
  // (window._saleChartActiveTraits -- this chart's own separate state,
  // not the item grid/pills' activeTraits; see the comment on it above)
  // jv: "0 traits sales are still not showing anything on the chart...
  // No sales, no dates nothing" -- that's consistent with an exception
  // partway through this section silently aborting the whole render
  // before Plotly.react() ever runs, rather than just some sales being
  // missed. Wrapped in try/catch so a bug here (whether this one or a
  // future one) shows up as a visible console error and a chart that
  // still renders its floor/background traces, instead of a silent,
  // undiagnosable blank chart.
  //
  // jv: "not getting anything when i select either trait count or any
  // traits" -- a filter that's active but genuinely has zero matching
  // sales in the selected time range looks IDENTICAL to a silently
  // broken filter (both show just the bare floor line) with nothing to
  // tell them apart. Surfaced explicitly now (see noMatchesMessage
  // below, drawn as an on-chart annotation once the layout is built)
  // so it's immediately obvious which situation it is, rather than
  // guessing again from a screenshot.
  let noMatchesMessage = null;
  let _scMatchedEth = null; // prices of sales matching the active trait filter(s), for the y-axis top
  try{
  const activePairs = [];
  for(const [name, vals] of window._saleChartActiveTraits){
    for(const val of vals) activePairs.push({name, value: val, label: `${name}: ${val}`});
  }
  // jv: "Does this also filter trait count as well?" -- window._saleChartTraitCount
  // is this chart's own separate "exactly N traits" filter (see the
  // comment on window._saleChartActiveTraits above for why this is no
  // longer the app-wide currentTraitCount) -- folded in here as one more
  // pair alongside the name:value ones above, so match-any/match-all,
  // dedup, and wallet-grouping all apply to it exactly the same way.
  if(typeof window._saleChartTraitCount !== 'undefined' && window._saleChartTraitCount !== null){
    activePairs.push({
      isCount: true, value: window._saleChartTraitCount,
      label: `${window._saleChartTraitCount} Trait${window._saleChartTraitCount===1?'':'s'}`
    });
  }
  const matchMode = window._saleChartMatchMode === 'all' ? 'all' : 'any';
  const minWalletBuys = Math.max(2, window._saleChartMinWalletBuys || 2);
  const highlightWallet = window._saleChartHighlightWallet;

  // jv (ChatGPT-drafted spec, confirmed): "A sale matching multiple
  // selected traits must not be counted or plotted as multiple separate
  // sales." The previous version built one independent trace per active
  // trait, so a sale matching two active traits at once got drawn twice.
  // Figure out which active pairs each sale actually matches ONCE, up
  // front, then apply match-any/match-all on that -- every sale ends up
  // in at most one group below, however many pairs it happens to satisfy.
  const matchedSales = []; // {sale, matchedPairs: [...]} , deduped
  if(activePairs.length){
    for(const s of allSales){
      // jv: "I'm not getting any sales data in the chart for 0 traits" --
      // ROW_CACHE alone is only ever partially populated; fall back to
      // the fully-loaded window._saleChartRowById (see
      // _ensureSaleChartFullData() above) for whatever it's missing.
      const row = ROW_CACHE.get(s.id) || window._saleChartRowById?.get(s.id);
      if(!row) continue;
      const matchedPairs = activePairs.filter(p => p.isCount
        ? (typeof getTraitCount === 'function' && getTraitCount(row) === p.value)
        : String(row.traits?.[p.name]) === String(p.value));
      if(matchMode === 'all'){
        if(matchedPairs.length === activePairs.length) matchedSales.push({sale:s, matchedPairs});
      } else if(matchedPairs.length > 0){
        matchedSales.push({sale:s, matchedPairs});
      }
    }
  }

  // Group for coloring/legend purposes: in "all" mode every matched sale
  // satisfies every active pair simultaneously, so there's just one
  // combined group. In "any" mode, group by each sale's FIRST matched
  // pair (deterministic, not re-plotted per additional pair it happens to
  // also satisfy) -- still one color-coded group per trait, still one
  // dot per sale either way.
  const matchGroups = new Map(); // key -> {label, color, pairs, matches:[sale,...]}
  if(matchMode === 'all' && matchedSales.length){
    const label = activePairs.map(p=>p.label).join(' + ');
    matchGroups.set('__all__', {
      label: `${label} (${matchedSales.length})`, color: _SALE_CHART_PALETTE[0],
      pairs: activePairs, matches: matchedSales.map(m=>m.sale).sort((a,b)=>a.ts-b.ts)
    });
  } else if(matchMode === 'any'){
    // jv: "each separate trait should have its own color." A sale matching
    // several selected traits went to whichever was picked FIRST, so a
    // broad first pick (e.g. a trait count) swallowed nearly every sale
    // and the other traits' colors barely appeared. Now it goes to the
    // RAREST trait it matches (fewest matching sales in view), so small
    // traits keep their own color; still one dot per sale. Colors come
    // from the stable per-trait map (_scSyncTraitColors).
    const pairKey = p => p.isCount ? `__COUNT__|||${p.value}` : `${p.name}|||${p.value}`;
    const pairCount = new Map();
    for(const m of matchedSales) for(const p of m.matchedPairs) pairCount.set(p, (pairCount.get(p)||0) + 1);
    const owner = m => m.matchedPairs.reduce((best, p) => (pairCount.get(p) < pairCount.get(best) ? p : best), m.matchedPairs[0]);
    const colors = _scSyncTraitColors();
    activePairs.forEach((pair, i) => {
      const matches = matchedSales
        .filter(m => owner(m) === pair)
        .map(m => m.sale)
        .sort((a,b)=>a.ts-b.ts);
      if(matches.length){
        const key = pairKey(pair);
        matchGroups.set(key, {
          label: `${pair.label} (${matches.length})`,
          color: colors.get(key) || _SALE_CHART_PALETTE[i % _SALE_CHART_PALETTE.length],
          pairs: [pair], matches
        });
      }
    });
  }

  if(activePairs.length) _scMatchedEth = [...matchGroups.values()].flatMap(g => g.matches.map(x => x.eth));

  if(activePairs.length && matchGroups.size === 0){
    noMatchesMessage = 'No sales match this filter in the selected time range.\nTry a wider range (90d / 180d / 1y / All).';
  }

  // jv (spec): "Let users tap a purchase to highlight that buyer's
  // complete matching purchase history while dimming unrelated activity"
  // + "a way to select or search for a specific wallet" + "optionally
  // show only wallets with a minimum number of matching purchases." Also
  // set automatically by setSaleChartAnchor() when a token is selected
  // (see jv: "I want all of the dots to dim a little and if the wallet
  // that purchased that token has any more buys highlight those dots").
  const dimmed = !!highlightWallet; // true whenever a wallet is highlighted -- everything else fades
  walletTokenIdsByAddr = new Map(); // for the richer wallet info below
  // jv: "white might not stand out enough. Might need a different
  // color... Maybe like a light purple??" Collected below as
  // matchGroups.forEach runs, then drawn as one dedicated trace AFTER
  // the loop (see jv's other request just below: bring the highlighted
  // wallet's own dots to the front so they're clickable even when
  // buried under other overlapping dots).
  const highlightedPoints = []; // {sale, color} for the on-top trace below

  const _hlLineX = [], _hlLineY = []; // highlighted wallet's line, one trace across all groups
  matchGroups.forEach((group, key) => {
    const byBuyer = new Map();
    for(const s of group.matches){
      const bkey = (s.buyer||'').toLowerCase();
      if(!bkey) continue;
      if(!byBuyer.has(bkey)) byBuyer.set(bkey, []);
      byBuyer.get(bkey).push(s);
    }
    const repeatCountBySale = new Map();
    for(const [bkey, buyerGroup] of byBuyer){
      if(buyerGroup.length < minWalletBuys) continue;
      for(const s of buyerGroup) repeatCountBySale.set(s, buyerGroup.length);
      if(!walletTokenIdsByAddr.has(bkey)) walletTokenIdsByAddr.set(bkey, []);
      walletTokenIdsByAddr.get(bkey).push(...buyerGroup.map(s=>({id:s.id, eth:s.eth, ts:s.ts, label:group.label})));
    }

    const isHighlightGroup = (s) => highlightWallet && (s.buyer||'').toLowerCase() === highlightWallet;
    if(highlightWallet){
      for(const s of group.matches){
        if(isHighlightGroup(s)) highlightedPoints.push({sale:s, group});
      }
    }
    traces.push({
      x: group.matches.map(s=>s.date), y: group.matches.map(s=>s.eth),
      mode:'markers', type:'scattergl',
      name: group.label,
      marker:{
        size: group.matches.map(s => isHighlightGroup(s) ? 10 : 7),
        color: group.matches.map(s => dimmed && !isHighlightGroup(s) ? rgbaFromHex(_scSubColor, .22) : group.color),
        line: group.matches.map(s => isHighlightGroup(s) ? {color:_C.purple, width:1.5} : {width:0})
      },
      hovertemplate:' <extra></extra>',
      customdata: group.matches.map(s=>({
        id:s.id, kind:'trait', traitLabel: group.label, groupColor: group.color,
        traitCount: group.matches.length, buyer:s.buyer||null,
        walletRepeatCount: repeatCountBySale.get(s)||1,
        ts:s.ts, eth:s.eth, isWeth:s.isWeth
      }))
    });

    // One connecting-line trace per buyer at/above the minimum-purchase
    // threshold -- no markers of its own (the trace above already drew
    // them) and no separate legend entry, otherwise a popular trait with
    // many repeat buyers would flood the legend with near-duplicate
    // entries. jv: "i wanted the default lines to stay a light grey
    // color. ONLY when a dot is selected... instead of the white line
    // i wanted it to be a light purple." Purple is reserved entirely
    // for the actively selected/highlighted wallet's own line now --
    // every other wallet's connecting line, selected or not, defaults
    // to plain light grey, same as before this only differed by
    // opacity depending on dimmed state, never color.
    // jv: "Having 1 trait filtered and 1 trait count and selecting
    // different dots crashed and auto reloaded the page." This used to
    // push ONE separate WebGL trace per repeat-buying wallet, per group.
    // A trait count covers a big slice of the collection, so it can have
    // hundreds-to-thousands of repeat buyers = that many GPU traces, all
    // rebuilt on every dot tap -- enough to exhaust mobile GPU memory and
    // get the tab killed (the real driver behind the tap-reloads; the
    // purge/debounce/context-loss work only mitigated it). Now every
    // non-highlighted wallet's line in a group is merged into ONE trace,
    // with a null point between wallets to break the line (same look),
    // and the highlighted wallet's purple line is collected into a single
    // trace across all groups (pushed below).
    const lx = [], ly = [];
    for(const [bkey, buyerGroup] of byBuyer){
      if(buyerGroup.length < minWalletBuys) continue;
      const isThisWallet = highlightWallet && bkey === highlightWallet;
      const tx = isThisWallet ? _hlLineX : lx, ty = isThisWallet ? _hlLineY : ly;
      if(tx.length){ tx.push(null); ty.push(null); }
      for(const s of buyerGroup){ tx.push(s.date); ty.push(s.eth); }
    }
    { // always pushed (maybe empty) -- fixed trace shape per group
      traces.push({
        x: lx, y: ly, mode:'lines', type:'scattergl', name:`${group.label} — wallets`,
        connectgaps:false,
        line:{ color: dimmed ? rgbaFromHex(_scSubColor, .10) : rgbaFromHex(_scSubColor, .40), width: 0.75 },
        hoverinfo:'skip', showlegend:false
      });
    }
  });
  // jv: "It searches it, recognizes it but doesn't bring up the wallet
  // sales history on the chart." Highlighted-wallet dots were only
  // collected from inside the trait match groups -- which only exist while
  // a trait filter is active. So with no trait selected there were no
  // groups and a searched wallet showed nothing at all; with a trait
  // selected, only that trait's buys showed. Now the wallet's COMPLETE
  // purchase history in the selected time range is pulled from allSales:
  // buys already found in a trait group keep that trait's color, every
  // other buy is added in the wallet purple, and the purple line runs
  // through all of them in time order. The y-axis includes them too.
  if(highlightWallet){
    const have = new Set(highlightedPoints.map(p => p.sale));
    const walletGroup = { label:'Wallet purchase', color:_C.purple, matches:[], isWallet:true };
    // jv: "does it show the sells?" -> "I want it and I think red will be
    // good." Sales where this wallet was the SELLER, in red, on the same
    // time-ordered line as its buys so buy -> sell -> buy reads as a flow.
    // (A sale with the wallet on both sides is counted once, as a buy.)
    const sellGroup = { label:'Wallet sale', color:_C.red, matches:[], isWallet:true, isSell:true };
    for(const sl of allSales){
      if(have.has(sl)) continue;
      if((sl.buyer||'').toLowerCase() === highlightWallet){
        walletGroup.matches.push(sl);
        highlightedPoints.push({ sale:sl, group:walletGroup });
      } else if((sl.seller||'').toLowerCase() === highlightWallet){
        sellGroup.matches.push(sl);
        highlightedPoints.push({ sale:sl, group:sellGroup });
      }
    }
    highlightedPoints.sort((a,b) => a.sale.ts - b.sale.ts);
    _hlLineX.length = 0; _hlLineY.length = 0;
    for(const hp of highlightedPoints){ _hlLineX.push(hp.sale.date); _hlLineY.push(hp.sale.eth); }
    if(_scMatchedEth) for(const hp of highlightedPoints) _scMatchedEth.push(hp.sale.eth);
    if(!highlightedPoints.length && !noMatchesMessage){
      noMatchesMessage = 'No buys or sells by this wallet in the selected time range.\nTry a wider range (90d / 180d / 1y / All).';
    }
  }
  // Accumulation Tracker: wallet stats in the legend line (see helpers).
  {
    let stats = null;
    if(highlightWallet){
      const cutoffTs = Date.now()/1000 - (window._saleChartDays || 30) * 86400;
      const tokenMatches = activePairs.length ? (id => {
        const row = ROW_CACHE.get(id) || window._saleChartRowById?.get(id);
        if(!row) return false;
        const mp = activePairs.filter(p => p.isCount
          ? (typeof getTraitCount === 'function' && getTraitCount(row) === p.value)
          : String(row.traits?.[p.name]) === String(p.value));
        return matchMode === 'all' ? mp.length === activePairs.length : mp.length > 0;
      }) : null;
      stats = { overall: _scComputeWalletStats(highlightWallet, cutoffTs, null),
                trait: tokenMatches ? _scComputeWalletStats(highlightWallet, cutoffTs, tokenMatches) : null };
      // "Holds" needs the Holders data; load it once in the background and
      // redraw when it arrives (the legend shows "…" until then).
      // Gondi trades (for the 'Gondi swaps' row): once per collection.
      if(!window._gondiTradesRequested && typeof dbFetch === 'function'){
        window._gondiTradesRequested = true;
        dbFetch('/db/gondi-trades').then(j => {
          window._gondiTrades = (j && j.ok && Array.isArray(j.trades)) ? j.trades : [];
          if(window._gondiTrades.length) ['saleChartHost','chartFullscreenHost'].forEach(id => {
            const el = document.getElementById(id);
            if(el && el.offsetWidth > 0) renderSaleChart(id);
          });
        }).catch(() => { window._gondiTrades = []; }); // older backends: no endpoint -> no row
      }
      if(!window._holdersLoaded && !window._scHoldersRequested && typeof loadHolders === 'function'){
        window._scHoldersRequested = true;
        Promise.resolve(loadHolders()).then(() => {
          ['saleChartHost','chartFullscreenHost'].forEach(id => {
            const el = document.getElementById(id);
            if(el && el.offsetWidth > 0) renderSaleChart(id);
          });
        }).catch(() => { window._scHoldersRequested = false; });
      }
    }
    const legendEl = document.getElementById(host.id === 'chartFullscreenHost' ? 'chartFullscreenDescription' : 'saleChartDescription');
    if(legendEl) legendEl.innerHTML = _scLegendHtml(highlightWallet, stats);
  }

  // Token gallery (desktop fullscreen only) -- see _scRenderGallery. Shown
  // ONLY when a trait filter is selected (every token with it) or a wallet
  // is highlighted (that wallet's tokens); nothing otherwise.
  if(_scGalleryEnabled(host) && (highlightWallet || activePairs.length)){
    const isFs = host.id === 'chartFullscreenHost';
    const listed = id => window.LISTINGS?.[id]?.opensea?.price_eth ?? null;
    const lastSale = new Map();
    for(const sl of allSales) lastSale.set(sl.id, sl.eth); // allSales is oldest->newest, so last write wins
    let title, items;
    if(highlightWallet){
      const byId = new Map();
      for(const hp of highlightedPoints){
        const sl = hp.sale;
        const cur = byId.get(sl.id) || { id: sl.id, ts: 0, buys: 0, sells: 0 };
        if(sl.ts >= cur.ts) cur.ts = sl.ts;
        if((sl.buyer||'').toLowerCase() === highlightWallet) cur.buys++;
        if((sl.seller||'').toLowerCase() === highlightWallet) cur.sells++;
        byId.set(sl.id, cur);
      }
      items = [...byId.values()].sort((a,b) => b.ts - a.ts);
      items.forEach(it => { it.listed = listed(it.id); it.last = lastSale.get(it.id) ?? null; });
      title = `Wallet ${highlightWallet.slice(0,6)}…${highlightWallet.slice(-4)}`;
      items._sortLabel = 'Most recent first';
    } else {
      // Every token that has the selected trait(s) -- same match rule as
      // the chart -- not just ones that sold. Cheapest listed first, then
      // unlisted by most recent sale price.
      // jv: "When I filtered a trait, no images displayed." The row map is
      // keyed by token id and the rows themselves don't reliably carry an
      // id field -- reading row.id dropped every token. Use the key.
      const rows = window._saleChartRowById ? [...window._saleChartRowById.entries()] : [];
      const matches = row => {
        const mp = activePairs.filter(p => p.isCount
          ? (typeof getTraitCount === 'function' && getTraitCount(row) === p.value)
          : String(row.traits?.[p.name]) === String(p.value));
        return matchMode === 'all' ? mp.length === activePairs.length : mp.length > 0;
      };
      items = [];
      for(const [key, row] of rows){
        const id = +key;
        if(!Number.isFinite(id) || !row || !matches(row)) continue;
        items.push({ id, listed: listed(id), last: lastSale.get(id) ?? null });
      }
      items.sort((a,b) => (a.listed == null) - (b.listed == null) || (a.listed ?? 0) - (b.listed ?? 0) || (b.last ?? 0) - (a.last ?? 0));
      title = activePairs.map(p => p.label).join(matchMode === 'all' ? ' + ' : ' / ');
      items._sortLabel = 'Price low to high';
    }
    const total = items.length, sortLabel = items._sortLabel || '';
    items = items.slice(0, 600); items._total = total; items._sortLabel = sortLabel;
    const _col = !!window._scgCollapsed;
    if(isFs){ const ov = document.getElementById('chartFullscreenOverlay'); ov?.classList.add('sc-gallery-on'); ov?.classList.toggle('sc-gallery-min', _col); }
    // Desktop tab: chart shrinks to make room for the strip (CSS), so the
    // tab's total height never changes -- see the fixed-height tab rule.
    else { host.classList.add('sc-has-gallery'); host.classList.toggle('sc-gallery-min', _col); }
    _scRenderGallery(host, title, items);
  } else if(host.id === 'chartFullscreenHost'){
    _scHideGallery('fullscreen');
  } else if(host.id === 'saleChartHost'){
    _scHideGallery('tab');
    host.classList.remove('sc-has-gallery', 'sc-gallery-min'); // chart takes the strip's space back
  }

  // Always pushed (possibly empty) so the trace list keeps the same shape
  // whether or not a wallet is highlighted -- see the crash note near
  // Plotly.react() below.
  {
    traces.push({
      x: _hlLineX, y: _hlLineY, mode:'lines', type:'scattergl', name:'Highlighted wallet line',
      connectgaps:false,
      line:{ color:_C.purpleLine, width:1.5 },
      hoverinfo:'skip', showlegend:false
    });
  }

  // jv: "when there are a lot of dots and a dot that's highlighted that
  // gets linked to a wallet is hidden behind those other dots you
  // can't click on it. Is there any way that when a dot is clicked...
  // [to] bring those dots to the top of other ones so that you can
  // easily click on that dot." Plotly stacks traces in array order --
  // later traces draw (and hit-test) on top of earlier ones, but ALL
  // points within a single trace share that same order; there's no
  // per-point z-index within one trace. Pushing one small EXTRA trace
  // containing just the highlighted wallet's own points, appended
  // after everything else built above, puts exactly those dots on top
  // of every other trace/dot they'd otherwise be buried under --
  // clickable regardless of how much else overlaps them.
  let _hlTrace = null;
  if(highlightedPoints.length){
    _hlTrace = ({
      x: highlightedPoints.map(p=>p.sale.date), y: highlightedPoints.map(p=>p.sale.eth),
      // jv: "not sure if its because i have multiple traits selected at
      // once but when clicking on a dot and its tracing the purchase
      // history the dots are not coming to front anymore and are hard
      // to click again." WebGL traces (scattergl, used everywhere else
      // here for performance with large datasets) share a single GPU
      // picking buffer across all scattergl traces on the chart --
      // that buffer doesn't reliably respect trace array order for
      // hit-testing the way SVG DOM elements do, so pushing this trace
      // last drew it on top visually but didn't reliably make it the
      // trace Plotly resolves a click/hover against when several
      // matchGroups (multiple active traits) mean several overlapping
      // scattergl traces at the same point. This one trace is always
      // small (just the highlighted wallet's own matches, never the
      // full dataset), so switching just it to plain 'scatter' (real
      // SVG elements, which DO respect DOM/array order for hit-testing)
      // costs nothing meaningful and makes the front-most trace
      // reliably the click-priority one too, not just the visual one.
      mode:'markers', type:'scatter', name:'Highlighted wallet',
      marker:{ size:14, color: highlightedPoints.map(p=>p.group.color), line:{color: highlightedPoints.map(p=>p.group.isSell ? _C.redOutline : _C.purple), width:2} },
      hovertemplate:' <extra></extra>', showlegend:false,
      customdata: highlightedPoints.map(p=>({
        // 'wallet-buy' / 'wallet-sell' for the highlighted wallet's own
        // non-trait trades (own tooltip labels, see the hover handler);
        // walletDot marks every dot of the highlighted wallet so tapping
        // one keeps that wallet highlighted (see the tap handler).
        id:p.sale.id, kind: p.group.isSell ? 'wallet-sell' : (p.group.isWallet ? 'wallet-buy' : 'trait'),
        walletDot:true, traitLabel: p.group.label, groupColor: p.group.color,
        traitCount: p.group.matches.length, buyer: p.group.isWallet ? null : (p.sale.buyer||null),
        walletRepeatCount: highlightedPoints.filter(p2=>p2.group===p.group).length,
        ts:p.sale.ts, eth:p.sale.eth, isWeth:p.sale.isWeth
      }))
    });
  }

  // Anchor token -- its own resale history highlighted as a connected
  // gold/triangle path. Everything else (which wallet gets dimmed vs.
  // brightened) is driven by highlightWallet above, which
  // setSaleChartAnchor() already set for us to this token's own buyer.
  let _anchorDotsTrace = null, _anchorLineTrace = null, _anchorArrowTrace = null;
  const anchor = window._saleChartAnchor;
  if(anchor){
    const anchorSales = allSales.filter(s=>s.id===anchor);
    if(anchorSales.length){
      // jv: "I'm not sure what the triangle is" -- the legend name alone
      // ("#8227 sales (1)") didn't make clear this is the token YOU
      // selected (by clicking a dot), not just another data series.
      // jv: "the arrows on the lines that strings them together are too
      // big. They need to be sized down significantly. They are covering
      // the dots." The path used size-10 triangle markers sitting
      // directly ON each sale, hiding the dot underneath. Now: the gold
      // path is line-only, with small direction arrows at each segment's
      // midpoint (between dots, never on them), and the sales themselves
      // drawn as enlarged dots on top (see _anchorDotsTrace below).
      _anchorLineTrace = ({
        x: anchorSales.map(s=>s.date), y: anchorSales.map(s=>s.eth),
        mode:'lines', type:'scattergl',
        name:`★ Selected #${anchor} (${anchorSales.length} sale${anchorSales.length===1?'':'s'})`,
        line:{color:_C.gold, width:2},
        hoverinfo:'skip'
      });
      if(anchorSales.length > 1){
        // Plotly 'arrow' symbol with angleref:'previous' points each
        // marker along the line from the point before it. Each segment
        // contributes an invisible (size 0) start point followed by its
        // visible midpoint arrow, so every arrow's "previous" is its own
        // segment's start -> correct direction. Midpoint in screen space:
        // plain average on the date axis, geometric mean on the log y axis.
        const ax = [], ay = [], asz = [];
        for(let i=0;i<anchorSales.length-1;i++){
          const a = anchorSales[i], b = anchorSales[i+1];
          ax.push(a.date); ay.push(a.eth); asz.push(0);
          ax.push(new Date((a.date.getTime()+b.date.getTime())/2));
          ay.push(Math.sqrt(Math.max(a.eth,1e-9)*Math.max(b.eth,1e-9)));
          asz.push(7);
        }
        _anchorArrowTrace = ({
          x: ax, y: ay, mode:'markers', type:'scatter',
          marker:{ symbol:'arrow', angleref:'previous', size:asz, color:_C.gold, line:{width:0} },
          hoverinfo:'skip', showlegend:false
        });
      }
      _anchorDotsTrace = {
        x: anchorSales.map(s=>s.date), y: anchorSales.map(s=>s.eth),
        mode:'markers', type:'scatter', showlegend:false,
        // jv: "When clicking a token image it should highlight the dot more on
        // the chart to stick out more." Bigger, with a bright outline ring
        // (white on dark themes, near-black on light) so it pops against
        // any cluster of dots.
        marker:{ size:19, color:_C.gold, line:{color: document.documentElement.getAttribute('data-theme') === 'minimal-light' ? '#18181b' : '#ffffff', width:3} },
        hovertemplate:' <extra></extra>',
        customdata: anchorSales.map(s=>({id:s.id, kind:'anchor', ts:s.ts, eth:s.eth, isWeth:s.isWeth}))
      };
      // jv: "the lines that show after clicking a dot I think are too
      // much for mobile. It's so hard to see past it" -- a fan of lines
      // to literally every one of hundreds/thousands of matched sales
      // became a solid white wedge once a trait had any real volume.
      // Replaced entirely (not just thinned) with "I want all of the
      // dots to dim a little and if the wallet that purchased that
      // token has any more buys highlight those dots" -- setSaleChartAnchor()
      // now derives and sets the wallet highlight for you automatically
      // from this token's own buyer, reusing the exact same dim/brighten
      // rendering the manual wallet search already does above, rather
      // than drawing anything extra here at all.
    }
  }
  // jv: "Can the dots that it strings together enlarge and jump on top
  // of the other dots so that it's easier to tap on them? When you
  // close out of that string of dots those dots should revert back to
  // normal size." Both "string" layers -- the highlighted wallet's
  // other buys and the selected token's own sales -- are pushed LAST,
  // as SVG traces (click-priority over every WebGL trace, see the
  // _hlTrace comment above), at size 14 vs the normal 7. They only
  // exist while a wallet/anchor is selected, so closing it drops them
  // and the dots are back to normal automatically.
  // Fixed shape: these five layers are ALWAYS pushed, in this order, as
  // empty placeholders when nothing is selected -- so tapping dots only
  // swaps data inside existing traces instead of adding/removing GPU
  // layers on every tap (see the crash note near Plotly.react()).
  const _emptyGl  = name => ({x:[], y:[], mode:'lines',   type:'scattergl', name, hoverinfo:'skip', showlegend:false});
  const _emptySvg = name => ({x:[], y:[], mode:'markers', type:'scatter',   name, hoverinfo:'skip', showlegend:false});
  traces.push(_anchorLineTrace  || _emptyGl('Selected path'));
  traces.push(_anchorArrowTrace || _emptySvg('Selected arrows'));
  traces.push(_hlTrace          || _emptySvg('Highlighted wallet'));
  traces.push(_anchorDotsTrace  || _emptySvg('Selected dots'));
  }catch(e){
    console.error('Sale Chart: matching/trace-building failed', e);
  }

  // jv: "I'm not sure what the triangle is and all the dots are laying
  // on the bottom. Hard to read." A linear axis with one rare high-value
  // sale compresses the entire rest of the (much more common, much
  // cheaper) distribution into a thin unreadable band at the bottom --
  // capping the range to a median-based ceiling only helps until an
  // outlier still slips past that cap (exactly what happened here).
  // Log scale instead, matching the same fix renderScatter() (Price vs
  // Rank) already uses for this identical long-tailed-price problem --
  // cheap and expensive sales both stay readable at the same time, no
  // manual ceiling to keep tuning.
  const cs = getComputedStyle(document.body);
  const textColor = cs.getPropertyValue('--text').trim()||'#e6edf7';
  const subColor  = cs.getPropertyValue('--sub').trim() ||'#7a8fa8';

  _scDockLegendInStrip(host);
  const layout = {
    height: host.clientHeight > 50 ? host.clientHeight : 300,
    width: host.clientWidth > 50 ? host.clientWidth : undefined,
    // Fullscreen: the header (close/title/controls/chips/legend line)
    // is absolutely positioned OVER the chart, and the top margin was
    // 8px -- so the top of the price range, exactly where a rarer,
    // pricier trait's dots land, sat hidden under it. Top margin now
    // clears the header's real height. offsetHeight/offsetTop are
    // layout values (unaffected by the portrait-mode CSS rotation).
    margin: (host.id === 'chartFullscreenHost')
      ? {l:44, r:8, b:28, t: (() => {
          const tb = document.querySelector('.chart-fullscreen-topbar');
          // (+18 on phones: room for the one-line legend along the top)
          return (tb ? Math.max(8, tb.offsetHeight - host.offsetTop + 6) : 8) + (window._tvIsPhone() ? 18 : 0);
        })()}
      : {l:56,r:16,t:10,b:48},
    paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)',
    font:{color:textColor, size:11},
    // jv: "there are too many values showing on the x axis and I'm not
    // a fan of all of the grid lines. Maybe on the x axis just show the
    // top and bottom numbers and maybe an avg 4 numbers in between."
    // nticks caps how many Plotly draws -- gridlines follow the same
    // tick positions, so fewer ticks means fewer gridlines too, no
    // separate setting needed for that. jv: "Full screen doesn't show
    // the correct chart/data when I switch over to full screen" --
    // Plotly.react() preserves a plot's existing pan/zoom state across
    // re-renders by design (so re-rendering for an unrelated reason,
    // like a trait filter change, doesn't reset a deliberate zoom) --
    // but that means a PAST manual zoom/pinch, from any earlier time
    // this exact host was open, keeps quietly overriding whatever range
    // the CURRENTLY selected day-range button actually asks for,
    // forever, since nothing here was telling it otherwise. Explicit
    // autorange:true forces a fresh full-range computation from the
    // current data on every single render instead, discarding any
    // stale prior zoom -- matches the actually-selected day range
    // (or trait filter, or anchor) every time rather than whatever the
    // last pinch happened to leave it at.
    xaxis:{type:'date', color:subColor, gridcolor:_themeGrid(), zeroline:false, nticks:6, autorange:true},
    // jv (follow-up): "There's too many eth values on the left. Way too
    // many I thought the last fix should have fixed that." -- the
    // earlier fix only capped the x-axis; a log y-axis's own default
    // tick mode labels every single digit within each decade (0.1, 0.2,
    // 0.3...0.9, 1, 2, 3...9, 10...), which is what was still cluttering
    // the price axis. dtick:1 on a log axis means "one tick per decade"
    // -- just the major powers of ten (0.1, 1, 10), matching the same
    // few-clean-numbers request as the x-axis fix.
    yaxis:{title:'ETH', type:'log', color:subColor, gridcolor:_themeGrid(), zeroline:false, autorange:true},
    showlegend:true,
    // jv: "I don't know what text that is behind the filters it looks
    // like 'floor' and '1 trait' can we move them to the top right.
    // Directly underneath the plotly control buttons?" This is
    // Plotly's own in-chart legend (trace names), not anything from
    // the topbar overlay -- it was sitting at the plot's default
    // top-left corner, directly behind the topbar (title/controls/
    // description), which sits over that same area. x:1/xanchor:right
    // puts it at the plot's top-right instead, with y:1/yanchor:top
    // landing it just below Plotly's own modebar (which renders
    // outside the plot area entirely, above this same corner) rather
    // than needing a manual pixel offset to clear it. Small
    // semi-transparent background so it stays readable over any data
    // points out there too, not fully invisible against them.
    // jv: "The floor, lines, and selected text can sit in 1 line right
    // underneath the filters or just push into the top left since we hid the
    // plotly controls" -- fullscreen on phones (no modebar): one horizontal
    // line along the top-left edge of the plot.
    legend: (host.id === 'chartFullscreenHost' && window._tvIsPhone())
      ? {orientation:'h', x:0, y:1, xanchor:'left', yanchor:'bottom', font:{size:10}, bgcolor:'rgba(0,0,0,0)'}
      : {x:1, y:1, xanchor:'right', yanchor:'top', font:{size:10}, bgcolor:'rgba(0,0,0,.45)'},
    hovermode:'closest'
  };
  // jv: "Is it possible to adjust the axis the eth price is on to the
  // top price of the selected trait or trait count? If not then the top
  // eth price should be the top price of the collection." Autorange fit
  // everything drawn (floor line included), so the top wasn't tied to
  // the selection. Now explicit: top = highest sale matching the active
  // trait/trait-count filter; with no filter (or a filter with no
  // matches), the collection's highest sale in the selected time frame.
  // Bottom still reaches down to include the floor line for context.
  // Small log-space padding so the top dot isn't clipped. dtick:1 (one
  // tick per decade) removed -- a tight range like 0.05-0.3 would have
  // shown one tick or none; Plotly's own log ticks adapt to the range.
  {
    const pos = v => typeof v === 'number' && v > 0 && isFinite(v);
    const pool = (_scMatchedEth && _scMatchedEth.filter(pos).length) ? _scMatchedEth.filter(pos) : allSales.map(x => x.eth).filter(pos);
    if(pool.length){
      const hi = Math.max(...pool);
      // Bottom reaches down for the floor line, but never more than 20x
      // below the plotted sales' median -- a stray junk-priced sale (or
      // floor dip) no longer stretches the axis across several orders of
      // magnitude and crams the real sales into a strip at the top.
      const sorted = pool.slice().sort((a,b)=>a-b);
      const med = sorted[Math.floor(sorted.length/2)];
      const lo = Math.max(Math.min(...pool, ...(floorTrace.y || []).filter(pos)), med / 20);
      const lhi = Math.log10(hi), llo = Math.log10(lo);
      const pad = Math.max(0.04, (lhi - llo) * 0.05);
      layout.yaxis = {...layout.yaxis, autorange:false, range:[llo - pad, lhi + pad], ..._scLogTicks(llo - pad, lhi + pad)};
    }
  }
  layout.hoverlabel = {bgcolor:'rgba(0,0,0,0)', bordercolor:'rgba(0,0,0,0)', font:{color:'rgba(0,0,0,0)', size:1}};
  // jv: "not getting anything when i select either trait count or any
  // traits" -- see noMatchesMessage above. Drawn as a plain on-chart
  // annotation (paper coordinates, centered) rather than an HTML
  // overlay, since the layout object here is already rebuilt fresh on
  // every render alongside everything else.
  if(noMatchesMessage){
    layout.annotations = [{
      text: noMatchesMessage.replace(/\n/g, '<br>'),
      xref:'paper', yref:'paper', x:0.5, y:0.5,
      showarrow:false, font:{size:13, color:subColor}, align:'center'
    }];
  }

  host._saleChartState = { allSales, walletTokenIdsByAddr };
  // jv: "website keeps reloading when clicking through dots." The
  // 150ms debounce on rapid clicks (see the tap handler) only catches
  // BURSTS of clicks landing within that window -- it doesn't help
  // steady, one-at-a-time browsing through dot after dot, which is
  // apparently still enough to trigger this. Root cause: this chart's
  // trace SET itself changes shape on almost every anchor click (the
  // highlighted-wallet trace, its connection lines, and the dimmed/
  // highlighted split are all conditionally pushed -- see traces.push
  // calls above), so Plotly.react() is doing a much heavier rebuild
  // here than a typical "just new data" react() call, on WebGL-backed
  // scattergl traces. That's a known way to leak GL contexts in
  // Plotly.js over a session, even without rapid clicking -- each
  // heavier react() can still fail to fully release the previous
  // context, and normal one-at-a-time browsing eventually accumulates
  // enough of them to hit the browser's own WebGL context cap and
  // force the reload.
  //
  // jv: "Clicking on a dot still reloaded my entire page." The
  // periodic reset below wasn't tight enough on its own -- widened
  // from every 12 renders to every 6. Also added a direct
  // plotly_webglcontextlost recovery listener below (bound once,
  // alongside the click/hover listeners) as a second layer: if the
  // context is lost anyway before the next scheduled purge catches
  // it, this purges and rebuilds immediately instead of leaving the
  // chart in a broken state that can cascade into the browser killing
  // and reloading the whole page rather than just this one chart.
  // jv: "Pages crashed again after clicking about 20 times or so on
  // different dots and changing traits." The periodic purge that was
  // here (every N renders) turned out to be part of the problem: each
  // purge + rebuild creates a brand-new WebGL context, and the browser
  // doesn't free the old one's GPU memory until GC gets around to it --
  // so purging accumulated memory instead of releasing it, and iOS
  // kills the tab once it runs out. Removed. Instead: the trace list
  // keeps a fixed shape across taps (see the placeholder traces below)
  // so Plotly.react() only swaps data in the existing GL context, GPU
  // pixel ratio is lowered (config below), and GL memory is released
  // explicitly when a host is torn down (_scReleaseGL).
  // jv: pinch-zoom state (see _scBindPinch) survives dot-tap re-renders
  // instead of snapping back to autorange on every tap.
  if(host._scZoomRanges){
    layout.xaxis = {...layout.xaxis, autorange:false, range:host._scZoomRanges.x.slice()};
    layout.yaxis = {...layout.yaxis, autorange:false, range:host._scZoomRanges.y.slice(), ..._scLogTicks(host._scZoomRanges.y[0], host._scZoomRanges.y[1])};
  }
  _scBindPinch(host);
  // A "No sales data yet." placeholder from a render before the data
  // arrived: Plotly draws beside foreign children rather than replacing
  // them, so it lingered under the chart (surfaced once the fullscreen
  // gallery made the chart shorter). Clear it before drawing.
  host.querySelectorAll(':scope > .sc-empty-msg').forEach(el => el.remove());
  // jv: "The chart in full screen is a little buggy and little slow... taps
  // keep registering as if I'm tapping the plotly controls." Plotly's mouse
  // defaults on a touch screen: any finger wobble during a tap became a
  // zoom-box drag (a surprise zoom + full redraw), quick taps hit
  // double-click "reset axes", and the modebar sat over the legend/dots.
  // On touch devices: taps are only taps; zoom/pan is the smooth two-finger
  // pinch (_scBindPinch); '↺ Reset' in the controls resets zoom.
  const _scTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if(_scTouch) layout.dragmode = false;
  Plotly.react(host, traces, layout, {
    responsive:true, displayModeBar: !_scTouch, displaylogo:false,
    doubleClick: _scTouch ? false : 'reset+autosize',
    modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d','toggleSpikelines'],
    modeBarButtonsToKeep:['zoom2d','pan2d','zoomIn2d','zoomOut2d','resetScale2d'],
    scrollZoom:true,
    // GPU canvas at 1.5x instead of Plotly's default 2x: ~44% less GPU
    // memory per chart, still sharp on phones (see crash note above).
    plotGlPixelRatio: 1.5
  });

  // Listeners bound exactly once ever, same structurally-can't-leak
  // pattern as renderFloorTrend()/renderScatter() above -- read current
  // data from host._saleChartState (reassigned fresh every render) rather
  // than closing over a stale copy.
  if(host._saleChartListenersBound) return;
  host._saleChartListenersBound = true;

  // jv: "Clicking on a dot still reloaded my entire page." Direct
  // recovery for the actual browser event Plotly fires when a
  // scattergl trace's WebGL context is lost, rather than only relying
  // on the periodic purge above to catch it ahead of time.
  host.on('plotly_webglcontextlost', () => {
    console.warn('Sale Chart: WebGL context lost, recovering');
    _scReleaseGL(host);
    renderSaleChart(host.id);
  });
  // Track Plotly's own zoom/pan (modebar, drag) so it's preserved too;
  // a reset (modebar "reset axes" / double-tap) clears it.
  host.on('plotly_relayout', ev => {
    if(!ev) return;
    if(ev['xaxis.autorange'] || ev['yaxis.autorange']){ host._scZoomRanges = null; return; }
    const fl = host._fullLayout;
    if(fl?.xaxis?.range && fl?.yaxis?.range && ('xaxis.range' in ev || 'xaxis.range[0]' in ev || 'yaxis.range' in ev || 'yaxis.range[0]' in ev)){
      host._scZoomRanges = { x: fl.xaxis.range.slice(), y: fl.yaxis.range.slice() };
    }
  });

  function _saleChartTooltipHtml(cd, sale, img, isTap){
    const imgH = img ? `<img src="${img}" style="width:60px;height:60px;object-fit:contain;border-radius:6px;image-rendering:pixelated;display:block;margin-bottom:8px">` : '';
    const rank = `<div style="font-size:11px;margin-bottom:3px">${displayRankHtml(cd.id, 'font-weight:700;')}</div>`;
    // jv: "make the eth price green like the rest of the page and weth
    // red." Was teal (#2dd4bf) for ETH -- var(--good) matches how the
    // token modal's own price (#mPrice) is colored elsewhere. WETH was
    // already #f87171 (red), unchanged.
    const price = sale ? `<div style="font-size:14px;font-weight:700;color:${sale.isWeth?'#f87171':'var(--good)'};margin-bottom:4px">Ξ ${sale.eth.toFixed(4)}${sale.isWeth?' WETH':''}</div>` : '';
    const ts = sale?.ts ? `<div style="font-size:10px;color:#7a8fa8;margin-top:2px">${new Date(sale.ts*1000).toLocaleString()}</div>` : '';
    // jv: Gondi/other-marketplace sales on the chart -- say where a sale
    // happened when it wasn't OpenSea ('Gondi trade' = a P2P trade that was
    // one NFT for ETH/WETH, i.e. effectively a sale).
    const _mk = sale?.ts != null ? window._scMarketplaceBySale?.get(`${cd.id}|${sale.ts}`) : null;
    const _mkLabel = _mk ? ({ 'gondi-trade':'Gondi trade', gondi:'Gondi', blur:'Blur', looksrare:'LooksRare', x2y2:'X2Y2', nftx:'NFTX', foundation:'Foundation' }[_mk] || (_mk.charAt(0).toUpperCase() + _mk.slice(1))) : '';
    const mkTag = _mkLabel ? `<div style="display:inline-block;margin-top:5px;padding:2px 7px;border-radius:999px;font-size:10px;font-weight:700;color:var(--text);background:color-mix(in srgb, var(--text) 10%, transparent)">${_mk === 'gondi-trade' ? '' : 'Sold on '}${_mkLabel}</div>` : '';
    let match = cd.kind === 'trait' ? `<div style="font-size:11px;color:${cd.groupColor||'#60a5fa'};font-weight:600;margin-top:4px">${cd.traitLabel} / ${cd.traitCount} sales</div>` : '';
    if(cd.kind === 'wallet-buy' || cd.kind === 'wallet-sell'){
      const hw = window._saleChartHighlightWallet || '';
      const who = hw ? (hw.slice(0,6)+'…'+hw.slice(-4)) : 'this wallet';
      match = `<div style="font-size:11px;color:${cd.kind==='wallet-sell'?'#f87171':'#c9a9ff'};font-weight:700;margin-top:4px">${cd.kind==='wallet-sell'?'Sold by':'Bought by'} ${who}</div>`
        + (isTap ? `<div onclick="_saleChartClearWalletHighlight('${host.id}')" style="font-size:11px;color:var(--tc-c9a9ff);font-weight:700;margin-top:4px;cursor:pointer;pointer-events:auto;text-decoration:underline">✕ Clear wallet highlight</div>` : '');
    }
    // jv (spec): "Display the buyer address, purchased token IDs,
    // purchase dates, prices, number of matching purchases, and total
    // ETH spent" + "Let users tap a purchase to highlight that buyer's
    // complete matching purchase history while dimming unrelated
    // activity." A clickable line right in the tap-preview tooltip --
    // the tooltip itself isn't part of the Plotly hit area, so this
    // never conflicts with the dot's own tap-to-anchor gesture. Needs its
    // own pointer-events:auto -- the tooltip container itself is
    // pointer-events:none (so a passive hover-only preview never blocks
    // clicks meant for whatever's underneath it), which was silently
    // swallowing taps on this link too until now.
    let walletNote = '';
    if(cd.kind === 'trait' && cd.walletRepeatCount > 1 && cd.buyer){
      const bkey = cd.buyer.toLowerCase();
      const items = host._saleChartState?.walletTokenIdsByAddr?.get(bkey) || [];
      const totalEth = items.reduce((s,i)=>s+i.eth, 0);
      const short = cd.buyer.slice(0,6)+'…'+cd.buyer.slice(-4);
      const isHighlighted = window._saleChartHighlightWallet === bkey;
      walletNote = `<div style="font-size:10px;color:#7a8fa8;margin-top:4px">${short} bought ${cd.walletRepeatCount} of this trait (Ξ ${totalEth.toFixed(3)} total)</div>`;
      if(isTap){
        walletNote += isHighlighted
          ? `<div onclick="_saleChartClearWalletHighlight('${host.id}')" style="font-size:11px;color:var(--tc-c9a9ff);font-weight:700;margin-top:4px;cursor:pointer;pointer-events:auto;text-decoration:underline">✕ Clear wallet highlight</div>`
          : `<div onclick="_saleChartHighlightWalletByAddr('${cd.buyer}','${host.id}')" style="font-size:11px;color:#2dd4bf;font-weight:700;margin-top:4px;cursor:pointer;pointer-events:auto;text-decoration:underline">👛 Highlight this wallet</div>`;
      }
    }
    const anchorTag = cd.kind === 'anchor' ? '<div style="font-size:10px;color:var(--tc-ffd76a);font-weight:700;margin-top:4px">★ Selected token</div>' : '';
    // jv: "an x in the corner of the token thumbnail preview to close
    // it. So closing the small preview will revert back to no clicks on
    // the dot" -- _saleChartClosePreview() undoes the selection/
    // highlight this same first tap just made and resets the tap state,
    // so tapping the same dot again starts over at the preview, not
    // straight to opening it.
    const closeBtn = isTap ? `<span onclick="_saleChartClosePreview('${host.id}')" style="position:absolute;top:4px;right:6px;font-size:16px;line-height:1;color:#7a8fa8;cursor:pointer;pointer-events:auto;padding:4px">×</span>` : '';
    return `${closeBtn}${imgH}
      <div style="font-weight:700;font-size:13px;margin-bottom:2px">#${cd.id}</div>
      ${rank}${price}${match}${walletNote}${anchorTag}${ts}${mkTag}
      <div style="color:#7a8fa8;font-size:10px;margin-top:6px">${isTap ? 'Tap again to open token' : 'Click to select this token'}</div>`;
  }
  // jv: "The hover display initially loads with the 'x' in the corner to
  // close it out but it disappears instantly and I can't close out the
  // hover display." On a touch screen a tap also produces a synthetic
  // hover: in fullscreen (hover allowed there for desktop fullscreen) it
  // replaced the tap preview (with ×) by the hover version (no ×), and the
  // matching un-hover could hide it. On touch screens taps own the preview;
  // hover/unhover are ignored. Desktop unchanged.
  const _scTouchOnly = () => window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  host.on('plotly_hover', data=>{
    if(_scTouchOnly()) return;
    const pt = data.points[0];
    const cd = pt.customdata;
    if(!cd || cd.id == null) return; // floor line has no customdata
    const ev = data.event;
    // jv: "token #1477 is showing up on multiple thumbnail display when
    // hovering... need to make sure the hover displays on the chart are
    // showing correct info." Was looking the sale back up by token id
    // alone (allSales2.find(s=>s.id===cd.id)) -- ambiguous for any
    // token with more than one sale in range, since .find() always
    // returns the FIRST match regardless of which specific dot (which
    // specific sale, at its own date/price) is actually being hovered.
    // ts/eth/isWeth are now embedded directly in each point's own
    // customdata at trace-build time, so this reads the exact sale that
    // point represents instead of guessing from just an id.
    const sale = { ts: cd.ts, eth: cd.eth, isWeth: cd.isWeth };
    host._saleChartHoverId = cd.id;
    // jv: "the hover display is still not working on full screen you
    // can see in the screenshot im hovering over a dot and its not
    // working." Two earlier attempts (pointer-events scoping on the
    // topbar, then swapping the width-based check for a
    // matchMedia('(hover:hover)') one) both missed: the hovered dot in
    // that screenshot sat well clear of the topbar/controls row, and
    // (hover:hover) itself can report false on a hybrid touch+mouse
    // laptop even while a real mouse is actively being used, since it
    // reflects the OS's notion of the "primary" pointer, not what's
    // driving this specific interaction. Fullscreen doesn't need this
    // guess at all -- it's never the cramped mobile sheet the check
    // was written for, and a touch tap there is already handled
    // correctly by the separate click handler below (which has always
    // bypassed this same check unconditionally). Bypassing it here too
    // whenever this host IS the fullscreen one removes the guess
    // entirely for this case instead of refining it further.
    const bypassHover = (host.id === 'chartFullscreenHost');
    _showChartTooltip('_saleChartTT', ev.clientX, ev.clientY, _saleChartTooltipHtml(cd, sale, _getTokenImgSrc(cd.id)), bypassHover);
    _getTokenImgSrcAsync(cd.id).then(img => {
      if(img && host._saleChartHoverId === cd.id){
        _showChartTooltip('_saleChartTT', ev.clientX, ev.clientY, _saleChartTooltipHtml(cd, sale, img), bypassHover);
      }
    });
  });
  host.on('plotly_unhover', ()=>{ if(_scTouchOnly()) return; host._saleChartHoverId = null; _hideChartTooltip('_saleChartTT'); });
  // jv: "Yes I want the dim/highlight to fire on the very first tap
  // instead as well as bring up the token thumbnail preview and
  // highlight the other wallet buys. The second tap will bring up the
  // token modal." First tap now does both at once (select as anchor --
  // dims everything else, brightens this buyer's other matches -- and
  // shows the preview), second tap on the same dot opens it.
  // bypassMobileCheck=true on the tooltip call -- this IS the deliberate
  // mobile interaction, not a stray hover.
  host.on('plotly_click', data=>{
    // Ignore the finger-lift at the end of a pinch landing as a dot tap.
    if(Date.now() - (host._scPinchEndTs||0) < 400) return;
    const pt = data.points[0];
    const cd = pt.customdata;
    if(!cd || cd.id == null) return;
    // Same fix as the hover handler above -- read the exact sale this
    // point represents from its own customdata instead of an ambiguous
    // by-id lookup.
    const sale = { ts: cd.ts, eth: cd.eth, isWeth: cd.isWeth };
    // jv: "Click on a tokens history dot on 2 separate dot locations
    // treats it as a double tap. The modal should only open when you
    // double tap a dot in its location." Was compared by token id alone
    // -- every dot on the selected token's gold string is the SAME token
    // (just different sales), so tapping two different dots on it read
    // as tapping one dot twice. Keyed on the specific sale (id + time +
    // price) now, so only a second tap on the exact same dot opens it.
    const tapKey = `${cd.id}|${cd.ts}|${cd.eth}`;
    if(host._saleChartLastTapId === tapKey){
      host._saleChartLastTapId = null;
      _scForgetPreTap(); // opening the token commits the selection
      if(typeof openModal === 'function') openModal(cd.id);
    } else {
      host._saleChartLastTapId = tapKey;
      const clientX = data.event.clientX, clientY = data.event.clientY;
      // jv: "on mobile, when i click a dot and bring the token display
      // up, and i click another dot it brings up the modal of the
      // first dot i click." The setTimeout(...,0) deferral below (added
      // for an earlier "thumbnail not popping up" report) opened a
      // small async window between this tap and the resulting chart
      // re-render -- a second, genuinely different tap landing inside
      // that window could get its click resolved against Plotly's still
      // -mid-update internal hit-testing state, misreporting it as a
      // repeat tap on the PREVIOUS dot instead of a fresh tap on the new
      // one. The real fix for the original thumbnail issue turned out
      // to be the sale-lookup bug fixed elsewhere in this same handler
      // (sale was sometimes undefined, breaking the tooltip HTML
      // silently) -- the deferral was masking that, not fixing it, and
      // is no longer needed. Back to a single synchronous call: tooltip
      // shown, then the anchor re-render, no gap for a second tap to
      // land in.
      _showChartTooltip('_saleChartTT', clientX, clientY, _saleChartTooltipHtml(cd, sale, _getTokenImgSrc(cd.id), true), true);
      _getTokenImgSrcAsync(cd.id).then(img => {
        if(img && host._saleChartLastTapId === tapKey){
          _showChartTooltip('_saleChartTT', clientX, clientY, _saleChartTooltipHtml(cd, sale, img, true), true);
        }
      });
      // jv: "ran into this issue a couple times where clicking on the
      // dots too fast on the chart reloads the browser." setSaleChartAnchor
      // triggers a full Plotly.react() re-render synchronously on every
      // single click, with no throttling at all -- a burst of rapid
      // clicks fires a burst of full re-renders in quick succession on
      // WebGL-backed traces (scattergl, used throughout this chart),
      // which can exhaust the browser's own WebGL context limit and
      // force a hard reload -- a known class of Plotly.js/WebGL issue
      // on mobile browsers specifically, not something unique to this
      // chart's own logic. Debounced so a burst of rapid clicks only
      // actually triggers ONE real re-render, for whichever dot was
      // clicked last, instead of one per click. The tooltip preview
      // above is untouched and still shows instantly on every tap,
      // since that's plain DOM, not Plotly.
      clearTimeout(host._saleChartAnchorDebounceTimer);
      const keepWallet = !!(cd.walletDot && window._saleChartHighlightWallet);
      // Remember what was selected BEFORE this tap, so closing the preview
      // (×) can undo just this tap (see _saleChartClosePreview). Only the
      // first tap of a sequence records it, so tapping around several dots
      // and then closing returns to where you started.
      if(!host._scPreTap) host._scPreTap = { anchor: window._saleChartAnchor, wallet: window._saleChartHighlightWallet };
      host._saleChartAnchorDebounceTimer = setTimeout(()=>setSaleChartAnchor(cd.id, host.id, keepWallet), 150);
    }
  });
}
// jv: "Searching a .eth address in the address search bar in the sales
// chart doesn't work. It should bring up the wallet activity history just
// for that wallet." The input was lowercased and used as-is, so a name
// like "foo.eth" was compared against 0x addresses, matched nothing, and
// silently did nothing. Now: 0x addresses apply directly; anything else
// is treated as an ENS name ("foo" -> "foo.eth") and resolved via the
// bot's /tv/ens-resolve, falling back to ENSIdeas directly if that
// collection's backend predates the endpoint. Status ("Looking up…",
// "Not found") shows in the input's placeholder so a miss isn't silent.
async function _saleChartHighlightWalletByAddr(input, hostId, inputEl){
  _scForgetPreTap();
  // Hidden switch for the tap inspector (installed app has no URL bar).
  if(String(input || '').trim().toLowerCase() === 'tapdebug'){ if(typeof tvToggleTapDebug === 'function') tvToggleTapDebug(); return; }
  const status = (msg, restoreMs) => {
    if(!inputEl) return;
    inputEl.value = '';
    inputEl.placeholder = msg;
    if(restoreMs) setTimeout(() => { if(inputEl.isConnected) inputEl.placeholder = 'Search 0x…, .eth or #'; }, restoreMs);
  };
  let q = String(input || '').trim().toLowerCase();
  if(!q){
    window._saleChartHighlightWallet = null;
    renderSaleChart(hostId || 'saleChartHost');
    return;
  }
  // jv: "does the sales chart have the ability to search token #?" -- it
  // didn't ("1234" was looked up as the ENS name 1234.eth). A number (or
  // #number) now selects that token exactly like tapping its dot: its
  // sales highlighted and the preview shown at its latest sale.
  const tokM = q.match(/^#?\s*(\d{1,7})$/);
  if(tokM){
    const id = +tokM[1];
    const host = document.getElementById(hostId || 'saleChartHost');
    if(inputEl) inputEl.value = '';
    if(host && _scTapTokenDot(host, id)) return;
    status(`No sales for #${id}`, 2500);
    return;
  }
  if(!/^0x[0-9a-f]{40}$/.test(q)){
    if(q.startsWith('0x')){ status('Invalid address', 2500); return; }
    if(!q.includes('.')) q += '.eth';
    status(`Looking up ${q}…`);
    let addr = null;
    try{
      const j = await dbFetch('/tv/ens-resolve', { name: q });
      addr = j?.address || null;
    }catch(e){
      try{
        const r = await fetch(`https://api.ensideas.com/ens/resolve/${encodeURIComponent(q)}`);
        const b = r.ok ? await r.json() : null;
        addr = (b?.address || '').toLowerCase() || null;
      }catch{}
    }
    if(!addr || !/^0x[0-9a-f]{40}$/.test(addr)){ status(`Not found: ${q}`, 3000); return; }
    q = addr;
  }
  if(inputEl){ inputEl.value = ''; }
  window._saleChartHighlightWallet = q;
  renderSaleChart(hostId || 'saleChartHost');
}
function _saleChartClearWalletHighlight(hostId){
  _scForgetPreTap();
  window._saleChartHighlightWallet = null;
  // Unified with the anchor (see setSaleChartAnchor()) -- clearing the
  // highlight from this side clears the selected token too, so the two
  // never end up out of sync with each other.
  window._saleChartAnchor = null;
  const btn = document.getElementById('saleChartClearAnchor');
  if(btn) btn.style.display = 'none';
  renderSaleChart(hostId || 'saleChartHost');
}
// jv: "an x in the corner of the token thumbnail preview to close it.
// So closing the small preview will revert back to no clicks on the dot
// so if you were to click on it again it will bring the preview up and
// the second tap will bring the modal up." Undoes exactly what the first
// tap just did (selection + dim/highlight) and resets the tap-tracking
// state on this host, so clicking the same dot again starts over at
// "first tap" rather than skipping straight to opening the modal.
// Original ask: "closing the small preview will revert back to no clicks on
// the dot." Then: "Closing out on a hover display resets the chart." -- the
// × cleared the selected token AND the highlighted wallet outright, so a
// wallet searched (or a token selected) BEFORE the tap was wiped too. Now
// it restores exactly what was selected before the tap(s) -- undoing only
// what the tapping changed -- and redraws only if something differs (zoom
// is preserved by renderSaleChart either way).
function _scForgetPreTap(){
  ['saleChartHost','chartFullscreenHost'].forEach(id => { const h = document.getElementById(id); if(h) h._scPreTap = null; });
}
// jv: "clicking the 'x' in the hover display closes out of the token and
// wallet lineage. Sometimes I just want to see the lineage line and tokens
// below without the hover display." The × now closes ONLY the preview; the
// selected token, wallet lineage and image strip stay. '↺ Reset' (in the
// controls) is the one-tap way back to a fresh chart.
function _saleChartClosePreview(hostId){
  _hideChartTooltip('_saleChartTT');
  const host = document.getElementById(hostId || 'saleChartHost');
  if(!host) return;
  host._saleChartLastTapId = null;
  _scForgetPreTap();
}
function _saleChartReset(hostId){
  _hideChartTooltip('_saleChartTT');
  _scForgetPreTap();
  window._saleChartAnchor = null;
  window._saleChartHighlightWallet = null;
  ['saleChartHost','chartFullscreenHost'].forEach(id => { const h = document.getElementById(id); if(h){ h._scZoomRanges = null; h._saleChartLastTapId = null; } });
  const btn = document.getElementById('saleChartClearAnchor');
  if(btn) btn.style.display = 'none';
  ['saleChartHost','chartFullscreenHost'].forEach(id => { const h = document.getElementById(id); if(h && h.offsetWidth > 0) renderSaleChart(id); });
}

// ════════════════════════════════════════════════════════════════════════════
// FEATURE: Fullscreen landscape chart overlay -- jv: "on mobile I want this
// view to be landscape only so it can be viewed fully.. have an easy way
// close out of it as well without closing the whole analytics panel" ...
// "when clicking full screen just push it straight to a fixed landscape
// view. Don't go to the screen that says turn your phone." Shared scaffold
// (one overlay, one close button) used by both the Sale Chart tab's own
// expand button and the wallet deep-dive feature below -- each owns its
// own host div inside the overlay so their Plotly listeners (bound once
// ever, per that function's existing pattern) never end up double-bound
// onto a host the other one also draws into. Portrait no longer gates
// behind a rotate-device prompt; the whole overlay gets CSS-rotated 90deg
// into a simulated landscape layout the instant it opens (see
// .chart-fullscreen-overlay.open in styles.css) rather than trying to
// force landscape via the Screen Orientation Lock API, which iOS Safari
// doesn't support outside an installed PWA at all.
// ════════════════════════════════════════════════════════════════════════════
// jv: "Taps just aren't registering at the right spot. It thinks I'm
// tapping above where I'm actually tapping ... tapping this dot thinks I'm
// tapping on details" -- and the same for the Show/Hide images buttons.
// Known iPhone Safari bug: with the page BEHIND a fixed full-screen layer
// scrolled, iOS can draw the layer in one place but hit-test taps as if it
// sat shifted by that scroll distance. Opening/closing the modal forced a
// re-layout, which is why that "fixed" it temporarily. While fullscreen is
// open on a phone the page is pinned in place (looks unchanged) with its
// real scroll position at the top -- no offset -- re-zeroed on rotation, and
// restored exactly on close.
function _tvLockPageScroll(lock){
  const b = document.body;
  if(lock){
    if(!window._tvIsPhone() || b.dataset.tvScrollLock) return;
    const y = window.scrollY || window.pageYOffset || 0;
    b.dataset.tvScrollLock = String(y);
    Object.assign(b.style, { position: 'fixed', top: `-${y}px`, left: '0', right: '0', width: '100%' });
    window.scrollTo(0, 0);
    if(!window._tvScrollLockRezero){
      window._tvScrollLockRezero = () => { if(document.body.dataset.tvScrollLock && (window.scrollY || 0) !== 0) window.scrollTo(0, 0); };
      window.addEventListener('resize', window._tvScrollLockRezero);
      window.addEventListener('orientationchange', () => setTimeout(window._tvScrollLockRezero, 300));
      window.addEventListener('scroll', window._tvScrollLockRezero, { passive: true });
    }
  } else {
    if(!b.dataset.tvScrollLock) return;
    const y = +b.dataset.tvScrollLock || 0;
    delete b.dataset.tvScrollLock;
    Object.assign(b.style, { position: '', top: '', left: '', right: '', width: '' });
    window.scrollTo(0, y);
  }
}
function openChartFullscreen(title, hostId, renderFn){
  const overlay = document.getElementById('chartFullscreenOverlay');
  if(!overlay) return;
  _scHideGallery(); // only the Sale Chart shows the token gallery; it re-enables it when it renders
  const titleEl = document.getElementById('chartFullscreenTitle');
  if(titleEl) titleEl.textContent = title;
  document.querySelectorAll('.chart-fullscreen-host').forEach(h => {
    h.style.display = (h.id === hostId) ? '' : 'none';
  });
  overlay.classList.add('open');
  overlay._activeRenderFn = renderFn; // re-invoked on resize/orientationchange below
  document.body.style.overflow = 'hidden';
  _tvLockPageScroll(true);
  // jv: "Completely full screen no padding" -- the CSS overlay above
  // already covers the whole viewport, but the browser's OWN chrome
  // (address bar, tab strip) still eats into that on top of it. The real
  // Fullscreen API hides that too, on whatever OS/browser actually
  // supports calling it on a plain element (not just <video>) -- newer
  // iOS Safari does, older versions and some Android WebViews don't.
  // Fails silently either way: the CSS overlay above is what actually
  // matters and works regardless, this is just the extra chrome-hiding
  // layer on top where available.
  const req = overlay.requestFullscreen || overlay.webkitRequestFullscreen;
  if(req) Promise.resolve(req.call(overlay)).catch(()=>{});
  // Plotly needs the host to actually have a real, laid-out size before it
  // can draw anything -- give the overlay's newly-applied "open" class a
  // frame to take effect first, same zero-width race every chart in this
  // file already guards against on its own host.
  requestAnimationFrame(()=>{ try{ renderFn(); }catch(e){ console.error('chart fullscreen render error:', e); } });
}
function closeChartFullscreen(){
  const overlay = document.getElementById('chartFullscreenOverlay');
  if(!overlay) return;
  overlay.classList.remove('open');
  _scHideGallery();
  overlay._activeRenderFn = null;
  // jv: crash after ~20 taps -- the fullscreen chart is a big retina GPU
  // canvas that otherwise keeps its WebGL memory after closing, stacked
  // on top of the sheet's own chart. It's fully re-rendered on every
  // open anyway, so release it now (Sale Chart and wallet deep-dive).
  ['chartFullscreenHost','walletDeepDiveHost','floorFullscreenHost'].forEach(id => _scReleaseGL(document.getElementById(id)));
  _placeModalForFullscreen(); // token modal back onto the page (see openModal)
  _restoreBodyOverflowAfterFullscreen();
  _tvLockPageScroll(false);
  _hideChartTooltip('_floorTT');
  // Floor Trend: carry a range/trait change made in fullscreen back to the tab.
  setTimeout(() => { const ft = document.getElementById('floorTrendHost'); if(ft && ft.offsetWidth > 0) renderFloorTrend('floorTrendHost'); }, 150);
  if(document.fullscreenElement || document.webkitFullscreenElement){
    (document.exitFullscreen || document.webkitExitFullscreen)?.call(document).catch?.(()=>{});
  }
  // jv: "going from landscape to portrait bugs the chart and analytics
  // panel... the analytics panel does not slidedown close fully and i
  // cannot re open it when it does that. I have to refresh the page."
  // The mobile sheet (openMobileAnalytics()) sets body.style.overflow
  // = 'hidden' too, independently, while it's open -- fullscreen is
  // layered ON TOP of that still-open sheet, not a replacement for it.
  // _restoreBodyOverflowAfterFullscreen() above now leaves that lock in
  // place if the sheet's still open, but the sheet's own embedded
  // chart may still be showing a stale size from before fullscreen
  // (and everything that happened while rotating through it) -- force
  // it to re-measure and redraw against the CURRENT viewport now that
  // we're back.
  setTimeout(()=>{
    try{
      if(typeof renderSaleChart === 'function' && document.getElementById('saleChartHost')) renderSaleChart('saleChartHost');
      if(typeof Plotly !== 'undefined') Plotly.Plots.resize('saleChartHost');
    }catch(e){}
  }, 150);
}
// jv: same root cause as above -- don't blindly clear the shared
// overflow lock on exit; only clear it if nothing else that also
// needs it (the mobile analytics sheet, wallet/holder drawers, the
// trait filter drawer) is still open underneath.
function _restoreBodyOverflowAfterFullscreen(){
  const stillLocked = ['mobileAnalyticsSheet','mobileWalletDrawer','mobileHolderDrawer','filtersColumn']
    .some(id => document.getElementById(id)?.classList.contains('open'));
  document.body.style.overflow = stillLocked ? 'hidden' : '';
}
// Covers exiting fullscreen via the OS/browser's own gesture (swipe,
// system back, etc.) rather than the × button -- keep the CSS overlay
// state and body scroll lock in sync either way.
['fullscreenchange','webkitfullscreenchange'].forEach(evt => {
  document.addEventListener(evt, () => {
    if(!document.fullscreenElement && !document.webkitFullscreenElement){
      const overlay = document.getElementById('chartFullscreenOverlay');
      if(overlay && overlay.classList.contains('open')){
        overlay.classList.remove('open');
        overlay._activeRenderFn = null;
        _restoreBodyOverflowAfterFullscreen();
      }
    }
  });
});
document.addEventListener('keydown', e => {
  if(e.key === 'Escape' && document.getElementById('chartFullscreenOverlay')?.classList.contains('open')) closeChartFullscreen();
});
// jv: "the view in landscape is not scaled right." Re-runs the active
// chart's full render (not just Plotly.Plots.resize()) whenever the
// viewport dimensions actually change while the overlay is open -- a
// full re-render re-measures host.clientWidth/clientHeight from scratch
// and rebuilds the layout against them, rather than trusting Plotly's own
// resize handling to keep up with the CSS rotate-transform trick above
// (a transform doesn't fire a resize event on its own, only an actual
// physical rotation or window resize does, so this only fires when the
// size has genuinely changed).
let _chartFullscreenResizeTimer = null;
function _handleChartFullscreenResize(){
  const overlay = document.getElementById('chartFullscreenOverlay');
  if(!overlay || !overlay.classList.contains('open') || !overlay._activeRenderFn) return;
  clearTimeout(_chartFullscreenResizeTimer);
  _chartFullscreenResizeTimer = setTimeout(()=>{
    try{ overlay._activeRenderFn(); }catch(e){ console.error('chart fullscreen resize re-render error:', e); }
  }, 120);
}
window.addEventListener('resize', _handleChartFullscreenResize);
window.addEventListener('orientationchange', _handleChartFullscreenResize);

// ════════════════════════════════════════════════════════════════════════════
// FEATURE: Wallet deep-dive -- jv: "I'd like to add a 'deep dive' feature
// in the wallet view when clicking on a wallet to see holdings. When
// clicking on wallet view it opens up a landscape view of a graph of all
// the buys of when and where that wallet purchased / sold from that
// wallet." Triggered from both wallet-view entry points (the Holders tab's
// top-wallets list already funnels into the same wallet drawer via
// openWalletView(), and the drawer's own manual address lookup) -- one
// button in each drawer, both opening this same fullscreen view. Reads the
// same window._floorEvents Floor Trend/Sale Chart already load; no
// separate fetch.
// ════════════════════════════════════════════════════════════════════════════
window._walletDeepDiveDays = 9999; // default: this wallet's full history, not just 30d

// Open Wallet View + its Wallet History chart for `addr` (from a wallet
// alert or an Activity inbox entry). Waits for the sales history to load so
// buys/sells are on the chart, then previews `tokenId` if given.
async function tvOpenWalletHistory(addr, tokenId){
  try{ if(typeof loadFloorTrend === 'function') loadFloorTrend(false); }catch(_){}
  const t0 = Date.now();
  while(!(window._floorEvents && window._floorEvents.length) && Date.now() - t0 < 12000) await new Promise(r => setTimeout(r, 300));
  try{ openWalletView(addr); }catch(_){}
  openWalletDeepDive(addr);
  if(tokenId != null){
    const host = document.getElementById('walletDeepDiveHost');
    const tryTap = (n) => {
      if(host && typeof host._scgTap === 'function' && host._wddAddress === addr.toLowerCase() && host._walletDeepDiveState?.moves){
        const known = [...(host._walletDeepDiveState.activity || []), ...(host._walletDeepDiveState.moves || [])].some(e => e.id === tokenId);
        if(known){ host._scgTap(tokenId); return; }
      }
      if(n < 10) setTimeout(() => tryTap(n + 1), 600);
    };
    setTimeout(() => tryTap(0), 900);
  }
}
window.tvOpenWalletHistory = tvOpenWalletHistory;

function openWalletDeepDive(address){
  address = (address||'').trim();
  if(!address) return;
  const short = address.slice(0,6)+'…'+address.slice(-4);
  openChartFullscreen(`${short} — Wallet History`, 'walletDeepDiveHost', ()=>renderWalletDeepDive(address, 'walletDeepDiveHost'));
}

function setWalletDeepDiveRange(days, address){
  window._walletDeepDiveDays = days;
  const _h = document.getElementById('walletDeepDiveHost');
  if(_h){ _h._scZoomRanges = null; document.querySelectorAll('#chartFullscreenTopControls .sc-reset-btn').forEach(b => b.remove()); }
  renderWalletDeepDive(address, 'walletDeepDiveHost');
}

// jv: "change that to 'wallet history' and add sells and transfers to that
// chart ... held or minted and no longer hold but don't have any sale
// history". Mints, plain transfers in/out, Gondi swaps and burns come from
// the bot's /db/wallet-activity (collection-wide transfer history); sales
// stay as before. Non-sale moves have no price, so they sit in a strip
// under the price chart instead of on the ETH axis.
window._wddActivity = window._wddActivity || new Map();
function _wddGetActivity(address, hostId){
  const key = `${LIVE_SLUG}:${address.toLowerCase()}`;
  const c = window._wddActivity.get(key);
  if(c) return c.data; // null while loading / if unavailable
  window._wddActivity.set(key, { data: null });
  dbFetch('/db/wallet-activity', { wallet: address.toLowerCase() }).then(j => {
    if(!j?.ok) throw new Error(j?.error || 'unavailable');
    window._wddActivity.set(key, { data: j });
    const host = document.getElementById(hostId || 'walletDeepDiveHost');
    if(host && host._wddAddress === address.toLowerCase()) renderWalletDeepDive(address, hostId);
  }).catch(e => {
    console.warn('[wallet-activity]', e.message);
    window._wddActivity.set(key, { data: { ok:false, events:[], unavailable:true } });
    const host = document.getElementById(hostId || 'walletDeepDiveHost');
    if(host && host._wddAddress === address.toLowerCase()) renderWalletDeepDive(address, hostId);
  });
  return null;
}
const WDD_MOVES = {
  mint:       { row:4, color:'#fbbf24', symbol:'diamond',     text:'◆ Minted' },
  in:         { row:3, color:'#60a5fa', symbol:'circle',      text:'● Received (no sale recorded)' },
  'swap-in':  { row:2, color:'#a3e635', symbol:'square',      text:'■ Swapped in (Gondi)' },
  'swap-out': { row:2, color:'#a3e635', symbol:'square-open', text:'□ Swapped out (Gondi)' },
  out:        { row:1, color:'#c084fc', symbol:'circle-open', text:'○ Sent out (no sale recorded)' },
  burn:       { row:0, color:'#f87171', symbol:'x',           text:'✕ Burned' },
};
// jv: "I want the same display token images on the bottom and the option to
// hide them." Same image strip as Sale Chart (_scRenderGallery, same Hide /
// Show memory): every token this wallet touched in range, most recent
// first. Tapping a tile replays the tap on that token's latest dot.
function _wddRenderGallery(host, address, hostId, activity, moves){
  const byId = new Map();
  for(const a of activity){
    const o = byId.get(a.id) || { id:a.id, buys:0, sells:0, last:0, cd:null };
    if(a.side === 'buy') o.buys++; else o.sells++;
    if(a.ts >= o.last){ o.last = a.ts; o.cd = { id:a.id, side:a.side, ts:a.ts, eth:a.eth }; }
    byId.set(a.id, o);
  }
  for(const e of moves){
    const o = byId.get(e.id) || { id:e.id, buys:0, sells:0, last:0, cd:null };
    if(e.ts >= o.last){ o.last = e.ts; o.cd = { id:e.id, side:e.type, ts:e.ts, other:e.other }; }
    byId.set(e.id, o);
  }
  const ov = document.getElementById('chartFullscreenOverlay');
  if(!byId.size){ ov?.classList.remove('sc-gallery-on', 'sc-gallery-min'); const g = document.getElementById('scGallery'); if(g) g.style.display = 'none'; return; }
  const items = [...byId.values()].sort((a,b) => b.last - a.last);
  items._total = items.length;
  items._sortLabel = 'Most recent';
  host._scgAnchor = null;
  host._scgRerender = () => renderWalletDeepDive(address, hostId);
  host._scgTap = (id) => {
    const o = byId.get(id); if(!o?.cd || typeof host.emit !== 'function') return;
    const cd = o.cd, r = host.getBoundingClientRect();
    let x = r.left + r.width / 2, y = r.top + r.height / 2;
    try{
      const xa = host._fullLayout.xaxis;
      const ya = WDD_MOVES[cd.side] ? host._fullLayout.yaxis2 : host._fullLayout.yaxis;
      const px = xa.l2p(xa.d2l(cd.ts * 1000));
      const py = ya.l2p(WDD_MOVES[cd.side] ? WDD_MOVES[cd.side].row : cd.eth);
      x = r.left + xa._offset + Math.max(0, Math.min(xa._length, px));
      y = r.top + ya._offset + Math.max(0, Math.min(ya._length, py));
    }catch(_){}
    host._wdLastTapId = null; // always the first tap: show the preview
    host.emit('plotly_click', { points: [{ customdata: cd }], event: { clientX: x, clientY: y } });
  };
  ov?.classList.add('sc-gallery-on');
  ov?.classList.toggle('sc-gallery-min', !!window._scgCollapsed);
  _scRenderGallery(host, 'Wallet tokens', items);
}
function renderWalletDeepDive(address, hostId){
  const host = document.getElementById(hostId || 'walletDeepDiveHost');
  if(!host) return;
  if(typeof Plotly === 'undefined'){ window.ensurePlotly && window.ensurePlotly(); setTimeout(()=>renderWalletDeepDive(address, hostId), 80); return; }
  if(host.offsetWidth === 0){ requestAnimationFrame(()=>renderWalletDeepDive(address, hostId)); return; }
  // Shares the same fullscreen overlay/topbar as Sale Chart -- clear
  // out any color-legend text Sale Chart may have left there, since
  // this view has no equivalent of its own.
  const descEl = document.getElementById('chartFullscreenDescription');
  if(descEl) descEl.innerHTML = '';
  // Shares the same topbar/controls-row elements as Sale Chart's own
  // fullscreen, which can leave both in a state sized/positioned for
  // ITS (potentially taller, wrapped) content. Clear the top-row slot
  // and let the day-range buttons below reflow the controls row's
  // offset against this view's own (shorter, single-line) topbar.
  const topControlsEl = document.getElementById('chartFullscreenTopControls');
  if(topControlsEl) topControlsEl.innerHTML = '';

  const days = window._walletDeepDiveDays || 9999;
  const controls = document.getElementById('chartFullscreenControls');
  if(controls){
    controls.innerHTML = [30,90,180,365,9999].map(d=>{
      const label = d===9999 ? 'All' : (d===365 ? '1y' : d+'d');
      const active = days === d;
      return `<button class="mispriced-mode-btn${active?' active':''}" onclick="setWalletDeepDiveRange(${d},'${address}')">${label}</button>`;
    }).join('');
  }
  requestAnimationFrame(()=>{
    const topbar = document.querySelector('.chart-fullscreen-topbar');
    if(topbar && controls) controls.style.top = (topbar.offsetHeight + 6) + 'px';
  });

  host._wddAddress = address.toLowerCase();
  const walletAct = _wddGetActivity(address, hostId);
  const events = window._floorEvents || [];

  const cutoff = days === 9999 ? 0 : Date.now()/1000 - days*86400;
  const addrLower = address.toLowerCase();
  const activity = [];
  for(const ev of events){
    const ts = ev.closing_date || ev.event_timestamp;
    if(!ts || ts < cutoff) continue;
    const buyer = (ev.buyer||'').toLowerCase();
    const seller = (ev.seller||'').toLowerCase();
    if(buyer !== addrLower && seller !== addrLower) continue;
    try{
      const qty = BigInt(ev.payment?.quantity||'0');
      const dec = ev.payment?.decimals??18;
      const eth = Number(qty)/Math.pow(10,dec);
      if(!isFinite(eth)||eth<=0) continue;
      const sym = ev.payment?.symbol||'';
      if(sym === 'TRANSFER') continue;
      const id = +(ev.nft?.identifier||0);
      activity.push({ ts, eth, id, date:new Date(ts*1000), side: buyer===addrLower ? 'buy' : 'sell' });
    }catch{}
  }
  const moves = [];
  for(const e of (walletAct?.events || [])){
    const m = WDD_MOVES[e.type];
    if(!m || !e.ts || e.ts < cutoff) continue; // buys/sells already come from sales above
    moves.push({ ...e, date:new Date(e.ts*1000), m });
  }
  moves.sort((a,b)=>a.ts-b.ts);
  // Summary line, e.g. "12 minted · 3 bought · 9 sold · 4 sent out"
  if(descEl){
    const cnt = {};
    for(const a of activity) cnt[a.side] = (cnt[a.side]||0) + 1;
    for(const e of moves) cnt[e.type] = (cnt[e.type]||0) + 1;
    const parts = [['mint','minted'],['buy','bought'],['sell','sold'],['in','received'],['out','sent out'],['swap-in','swapped in'],['swap-out','swapped out'],['burn','burned']]
      .filter(([k]) => cnt[k]).map(([k, w]) => `<b style="color:var(--text)">${cnt[k]}</b> ${w}`);
    const tail = !walletAct ? ' · <span style="opacity:.7">loading transfers…</span>'
      : walletAct.unavailable ? ' · <span style="opacity:.7">transfers not available for this collection yet</span>' : '';
    const key = `<span style="color:#2dd4bf">▲ Buy</span> <span style="color:#f87171">▼ Sell</span>` + (moves.length ? ` <span style="color:#fbbf24">◆ Mint</span> <span style="color:#60a5fa">● In</span> <span style="color:#c084fc">○ Out</span>` : '');
    descEl.innerHTML = (parts.length || tail) ? `<span style="font-size:11px;color:var(--sub)">${key} &nbsp;·&nbsp; ${parts.join(' · ')}${tail}</span>` : '';
  }
  if(!activity.length && !moves.length){
    host.innerHTML = `<div style="color:var(--sub);font-size:12px;padding:20px 0">${walletAct ? 'No activity found for this wallet in range.' : 'Loading wallet history…'}</div>`;
    return;
  }
  activity.sort((a,b)=>a.ts-b.ts);

  const pathTrace = {
    x: activity.map(a=>a.date), y: activity.map(a=>a.eth),
    mode:'lines+markers', type:'scattergl', name:'Activity',
    line:{color:'rgba(255,255,255,.25)', width:1},
    marker:{
      size:9,
      color: activity.map(a=> a.side==='buy' ? '#2dd4bf' : '#f87171'),
      symbol: activity.map(a=> a.side==='buy' ? 'triangle-up' : 'triangle-down')
    },
    hovertemplate:' <extra></extra>',
    customdata: activity.map(a=>({id:a.id, side:a.side, ts:a.ts, eth:a.eth}))
  };
  const moveTrace = moves.length ? {
    x: moves.map(e=>e.date), y: moves.map(e=>e.m.row), yaxis:'y2',
    mode:'markers', type:'scattergl', name:'Moves',
    marker:{ size:9, color: moves.map(e=>e.m.color), symbol: moves.map(e=>e.m.symbol), line:{ width:1.5, color: moves.map(e=>e.m.color) } },
    hovertemplate:' <extra></extra>',
    customdata: moves.map(e=>({id:e.id, side:e.type, ts:e.ts, other:e.other}))
  } : null;

  const cs = getComputedStyle(document.body);
  const textColor = cs.getPropertyValue('--text').trim()||'#e6edf7';
  const subColor  = cs.getPropertyValue('--sub').trim() ||'#7a8fa8';
  const layout = {
    height: host.clientHeight > 50 ? host.clientHeight : 300,
    width: host.clientWidth > 50 ? host.clientWidth : undefined,
    // top margin clears the title/summary/range buttons drawn over the chart
    // (the ETH labels used to sit underneath them)
    margin:{l:44,r:8,t:(()=>{ try{ const cb = controls?.getBoundingClientRect(), hr = host.getBoundingClientRect(); return cb && cb.height ? Math.max(28, Math.round(cb.bottom - hr.top + 8)) : 28; }catch(_){ return 28; } })(),b:28},
    paper_bgcolor:'rgba(0,0,0,0)', plot_bgcolor:'rgba(0,0,0,0)',
    font:{color:textColor, size:11},
    // Same de-clutter as Sale Chart's own x-axis, for consistency.
    // autorange:true for the same reason as Sale Chart's own axes --
    // forces a fresh full-range computation every render rather than
    // Plotly silently preserving a stale prior manual zoom.
    xaxis:{type:'date', color:subColor, gridcolor:_themeGrid(), zeroline:false, nticks:6, autorange:true},
    yaxis:{title:'ETH', color:subColor, gridcolor:_themeGrid(), zeroline:false, tickformat:'.4f', autorange:true, rangemode:'nonnegative',
      domain: moves.length && activity.length ? [0.4, 1] : [0, 1], visible: activity.length > 0},
    yaxis2:{ domain: moves.length ? (activity.length ? [0, 0.3] : [0, 1]) : [0, 0.01], range:[-0.6, 4.6], fixedrange:true,
      tickvals:[0,1,2,3,4], ticktext:['Burn','Out','Swap','In','Mint'], color:subColor, gridcolor:_themeGrid(), zeroline:false, visible: moves.length > 0 },
    showlegend:false,
    hovermode:'closest',
  };
  // jv: "the buy and sell descriptions are running off the top left of the
  // screen" -- the color key was a Plotly annotation above the plot area;
  // it now lives in the summary line under the title (see above).
  if(host._scZoomRanges){
    layout.xaxis = Object.assign({}, layout.xaxis, { range: host._scZoomRanges.x.slice(), autorange: false });
    layout.yaxis = Object.assign({}, layout.yaxis, { range: host._scZoomRanges.y.slice(), autorange: false });
  }
  // jv: "hide the plotly controls in the wallet history chart just like
  // sales chart and have the smooth pinch to zoom, one finger drag etc."
  // Same touch setup as Sale Chart / Floor Trend: no modebar, no drag-box
  // zoom (a slightly moving tap zoomed into a few milliseconds -- the blank
  // "19:45:08.596" chart), no double-tap reset; zoom/pan = _scBindPinch.
  const _wdTouch = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if(_wdTouch) layout.dragmode = false;
  // dates along the very bottom (under the Mint/In/Out strip), not between
  if(moves.length) layout.xaxis = Object.assign({}, layout.xaxis, { anchor:'y2' });
  layout.hoverlabel = {bgcolor:'rgba(0,0,0,0)', bordercolor:'rgba(0,0,0,0)', font:{color:'rgba(0,0,0,0)', size:1}};

  host._walletDeepDiveState = { activity, moves };
  Plotly.react(host, moveTrace ? (activity.length ? [pathTrace, moveTrace] : [moveTrace]) : [pathTrace], layout, {
    responsive:true, displayModeBar: !_wdTouch, displaylogo:false,
    doubleClick: _wdTouch ? false : 'reset+autosize',
    plotGlPixelRatio: 1.5,
    modeBarButtonsToRemove:['select2d','lasso2d','autoScale2d','toggleSpikelines'],
    modeBarButtonsToKeep:['zoom2d','pan2d','zoomIn2d','zoomOut2d','resetScale2d'],
    scrollZoom:true
  });
  host._scResetFn = () => {
    host._scZoomRanges = null;
    document.querySelectorAll('#chartFullscreenTopControls .sc-reset-btn').forEach(b => b.remove());
    renderWalletDeepDive(address, hostId);
  };
  if(typeof _scBindPinch === 'function') _scBindPinch(host);
  _wddRenderGallery(host, address, hostId, activity, moves);

  if(host._walletDeepDiveListenersBound) return;
  host._walletDeepDiveListenersBound = true;

  function _wdTooltipHtml(cd, item, img, isTap){
    const imgH = img ? `<img src="${img}" style="width:60px;height:60px;object-fit:contain;border-radius:6px;image-rendering:pixelated;display:block;margin-bottom:8px">` : '';
    const rank = `<div style="font-size:11px;margin-bottom:3px">${displayRankHtml(cd.id, 'font-weight:700;')}</div>`;
    const mv = WDD_MOVES[cd.side];
    const otherShort = cd.other ? cd.other.slice(0,6)+'…'+cd.other.slice(-4) : '';
    const sideTag = mv
      ? `<div style="font-size:11px;color:${mv.color};font-weight:700">${mv.text}</div>${otherShort && cd.side !== 'mint' && cd.side !== 'burn' ? `<div style="font-size:10px;color:#7a8fa8">${cd.side === 'in' || cd.side === 'swap-in' ? 'from' : 'to'} ${otherShort}</div>` : ''}`
      : cd.side==='buy'
      ? '<div style="font-size:11px;color:#2dd4bf;font-weight:700">▲ Bought</div>'
      : '<div style="font-size:11px;color:var(--tc-f87171);font-weight:700">▼ Sold</div>';
    const price = item && item.eth != null ? `<div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:4px">Ξ ${item.eth.toFixed(4)}</div>` : '';
    const ts = item?.ts ? `<div style="font-size:10px;color:#7a8fa8;margin-top:2px">${new Date(item.ts*1000).toLocaleString()}</div>` : '';
    return `${imgH}
      <div style="font-weight:700;font-size:13px;margin-bottom:2px">#${cd.id}</div>
      ${rank}${sideTag}${price}${ts}
      <div style="color:#7a8fa8;font-size:10px;margin-top:6px">${isTap ? 'Tap again to open token' : 'Click to open token'}</div>`;
  }
  host.on('plotly_hover', data=>{
    if(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) return; // taps own the preview on touch
    const pt = data.points[0]; const cd = pt.customdata; if(!cd) return;
    const ev = data.event;
    // Same fix as Sale Chart's own hover/click handlers -- read the
    // exact sale this point represents from its own customdata rather
    // than an ambiguous by-id lookup (this wallet could easily have
    // bought/sold the same token more than once).
    const item = { ts: cd.ts, eth: cd.eth };
    host._wdHoverId = cd.id+cd.side+cd.ts;
    // jv: "the hover display is still not working on full screen." Same
    // fix as Sale Chart's own hover handler above -- wallet deep-dive
    // only ever renders inside the fullscreen overlay (it has no
    // embedded/normal-tab form at all), so this bypasses the
    // touch-device guess unconditionally rather than trying to detect
    // anything.
    _showChartTooltip('_wdTT', ev.clientX, ev.clientY, _wdTooltipHtml(cd, item, _getTokenImgSrc(cd.id)), true);
    _getTokenImgSrcAsync(cd.id).then(img=>{
      if(img && host._wdHoverId === cd.id+cd.side+cd.ts){
        _showChartTooltip('_wdTT', ev.clientX, ev.clientY, _wdTooltipHtml(cd, item, img), true);
      }
    });
  });
  host.on('plotly_unhover', ()=>{ host._wdHoverId=null; _hideChartTooltip('_wdTT'); });
  host.on('plotly_click', data=>{
    if(Date.now() - (host._scPinchEndTs || 0) < 400) return; // lift after a pinch/drag
    const pt = data.points[0]; const cd = pt.customdata; if(!cd) return;
    const item = { ts: cd.ts, eth: cd.eth };
    const tapKey = cd.id+cd.side+cd.ts;
    if(host._wdLastTapId === tapKey){
      host._wdLastTapId = null;
      if(typeof openModal==='function') openModal(cd.id);
    } else {
      host._wdLastTapId = tapKey;
      const clientX = data.event.clientX, clientY = data.event.clientY;
      // jv: "need to add the same hover display when clicking on the arrows" --
      // tap calls lacked bypassMobileCheck, so on touch screens the preview
      // silently never showed (the Sale Chart's tap handler passes it).
      _showChartTooltip('_wdTT', clientX, clientY, _wdTooltipHtml(cd, item, _getTokenImgSrc(cd.id), true), true);
      _getTokenImgSrcAsync(cd.id).then(img=>{
        if(img && host._wdLastTapId === tapKey){
          _showChartTooltip('_wdTT', clientX, clientY, _wdTooltipHtml(cd, item, img, true), true);
        }
      });
    }
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
    const r = await fetch(`${LIVE_ENDPOINT}/nft/holders?contract=${LIVE_CONTRACT}&chain=${LIVE_CHAIN}`);
    const j = await r.json();

    if(!j.ok) throw new Error(j.error || 'Holder fetch failed');

    const holders = j.holders || []; // [{address, count, tokens:[]}]
    // jv: "The total tokens is wrong here" (9,999 for Argonauts). That was
    // the contract's totalSupply(), which still counts tokens sent to a
    // burn address, and the ID filter below was hardcoded to OCAS's 1-10000
    // range. Now: burn addresses are left out of the holder list, their
    // tokens shown as "Burned", and Total Tokens = tokens actually sitting in
    // real wallets, so every % on this tab adds up.
    const BURN_ADDRS = new Set(['0x0000000000000000000000000000000000000000', '0x000000000000000000000000000000000000dead']);
    const isOcasIds = LIVE_SLUG === 'on-chain-all-stars';
    const seenWallets = new Set();
    const dedupedHolders = [];
    let burnedCount = 0;
    for(const h of holders){
      const addr = (h.address||'').toLowerCase();
      if(!addr || seenWallets.has(addr)) continue;
      seenWallets.add(addr);
      const tokenSet = new Set((h.tokens||[]).map(id => {
        const n = typeof id === 'string' && id.startsWith('0x') ? parseInt(id,16) : parseInt(id,10);
        return isNaN(n) ? null : n;
      }).filter(n => n !== null && (isOcasIds ? (n > 0 && n <= 10000) : n >= 0)));
      if(BURN_ADDRS.has(addr)){ burnedCount += tokenSet.size || h.count || 0; continue; }
      dedupedHolders.push({...h, tokens: [...tokenSet], count: tokenSet.size || h.count || 0});
    }
    dedupedHolders.sort((a,b) => b.count - a.count);
    const totalSupply   = dedupedHolders.reduce((n,h)=>n+h.count,0) || j.total_supply || 0;
    const uniqueWallets = dedupedHolders.length;

    const top10Count  = dedupedHolders.slice(0,10).reduce((s,h)=>s+h.count,0);
    const top10Pct    = totalSupply ? ((top10Count/totalSupply)*100).toFixed(1) : '–';
    const top100Count = dedupedHolders.slice(0,100).reduce((s,h)=>s+h.count,0);
    const top100Pct   = totalSupply ? ((top100Count/totalSupply)*100).toFixed(1) : '–';
    const diamonds = dedupedHolders.filter(h => h.count >= 5).length;

    const sorted_wallets = dedupedHolders.map(h => ({wallet: h.address, count: h.count, ids: h.tokens}));

    window._holdersData = {sorted_wallets, totalTracked: totalSupply, uniqueWallets, top10Pct, top100Pct, diamonds, top10Count, burnedCount};
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
  _renderHolderRankBar();

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
        if(traitTokenSet.has(n)) matchingIds.push(n); // no ID cap: TOKEN_COUNT is the survivor count, not the max ID
      }
    } else {
      // Fallback: chunk-based matching (if DB API failed)
      for(const id of (w.ids || [])){
        const n = +id;
        if(!Number.isFinite(n) || n < 0) continue;
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
  if(gridEl && (window._holderRank || 'held') !== 'held') return _renderRankedHolders(gridEl, walletMatches);

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
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--sub);font-size:9px">#${id}</div>`;
      return `<div
        style="width:38px;height:38px;border-radius:5px;overflow:hidden;border:1px solid color-mix(in srgb, var(--text) 12%, transparent);background:var(--soft);cursor:pointer;flex-shrink:0"
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
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--sub);font-size:9px">#${id}</div>`;
      return `<div
        style="width:32px;height:32px;border-radius:4px;overflow:hidden;border:1px solid color-mix(in srgb, var(--text) 8%, transparent);background:var(--soft);cursor:pointer;flex-shrink:0"
        onclick="event.stopPropagation();openModal(${id})"
        onmouseenter="_holderThumbEnter(${id},event.clientX,event.clientY)"
        onmouseleave="_hideChartTooltip('_holderThumbTT')"
      >${imgTag}</div>`;
    }).join('');

    return `<div style="padding:6px 8px;border-radius:8px;background:color-mix(in srgb, var(--text) 3%, transparent);border:1px solid color-mix(in srgb, var(--text) 5%, transparent);margin-bottom:2px;cursor:pointer"
      onclick="openWalletView('${addr}')">
      <div style="display:grid;grid-template-columns:18px 1fr auto;gap:6px;align-items:center;margin-bottom:4px">
        <span style="font-size:10px;color:var(--sub);font-weight:600">${i+1}</span>
        <span style="font-family:monospace;font-size:11px;color:var(--text)">${short}
          <span style="font-size:10px;color:#2dd4bf;font-weight:700;margin-left:6px">${w.matchCount} matching</span>
          <span style="font-size:10px;color:var(--sub)">/ ${w.count} total</span>
        </span>
        <a href="${osUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-size:10px;color:var(--sub);opacity:.6">↗</a>
      </div>
      <div style="height:3px;border-radius:2px;background:color-mix(in srgb, var(--text) 8%, transparent);overflow:hidden;margin-bottom:5px">
        <div style="height:100%;width:${barW}%;background:linear-gradient(90deg,#2dd4bf,#7c5cff);border-radius:2px"></div>
      </div>
      <div style="display:flex;gap:10px;font-size:10px;color:var(--sub);flex-wrap:wrap;margin-bottom:${w.matchingIds.length>0?'6px':'0'}">
        <span><b style="color:var(--text)">${w.count}</b> total tokens (${pct}%)</span>
        ${estVal ? `<span>≈ <b style="color:#2dd4bf">${estVal} ETH</b></span>` : ''}
        ${listedCount > 0 ? `<span><b style="color:var(--tc-f59e0b)">${listedCount}</b> listed</span>` : ''}
      </div>
      ${w.matchingIds.length > 0 ? `<div class="holder-thumb-gallery" onclick="event.stopPropagation()">
        ${thumbsHtml}
        ${unlistedHtml ? `<div style="width:1px;height:24px;background:color-mix(in srgb, var(--text) 10%, transparent);margin:0 4px;flex-shrink:0"></div>${unlistedHtml}` : ''}
      </div>` : ''}
    </div>`;
  }).join('');
}

// ── Holder insights: "Rank by" ──────────────────────────────────────────────
// jv: "Wallet hold time, top minter, top p&l, which wallet is holding the
// most of what traits, which wallet bought the most, which sold, which
// wallets sold for a total losses" -> kept inside the Holders tab as one
// "Rank by" row. Same wallet list, ranked by a different number from the
// bot's /db/holder-stats. Works with the trait filter (ranks only wallets
// holding the selected traits) and Top 10/100/All.
const HOLDER_RANKS = [
  { k:'held',     label:'Most held' },
  { k:'hold',     label:'Longest held' },
  { k:'mint',     label:'Top minters' },
  { k:'bought',   label:'Most bought' },
  { k:'sold',     label:'Most sold' },
  { k:'pnlBest',  label:'Best P&L' },
  { k:'pnlWorst', label:'Worst P&L' },
];
function _renderHolderRankBar(){
  const bar = document.getElementById('holderRankBar');
  if(!bar) return;
  const cur = window._holderRank || 'held';
  bar.innerHTML = `<span style="font-size:10px;color:var(--sub);white-space:nowrap;margin-right:2px">Rank by</span>` +
    HOLDER_RANKS.map(r => {
      const on = r.k === cur;
      return `<button type="button" class="hrb-pill${on ? ' hrb-on' : ''}" onclick="_setHolderRank('${r.k}')" style="flex:0 0 auto;white-space:nowrap;font-size:10px;padding:3px 9px;border-radius:999px;cursor:pointer;border:1px solid ${on ? 'rgba(45,212,191,.55)' : 'color-mix(in srgb, var(--text) 10%, transparent)'};background:${on ? 'rgba(45,212,191,.14)' : 'color-mix(in srgb, var(--text) 3%, transparent)'};color:${on ? '#2dd4bf' : 'var(--sub)'};font-weight:${on ? 700 : 500}">${r.label}</button>`;
    }).join('');
}
function _setHolderRank(k){
  window._holderRank = k;
  const traits = typeof activeTraits !== 'undefined' ? activeTraits : new Map();
  if(traits.size) renderHoldersByTrait(); else renderHolders();
}
async function _ensureHolderStats(){
  const slug = typeof LIVE_SLUG !== 'undefined' ? LIVE_SLUG : '';
  const c = window._holderStats;
  if(c && c.slug === slug) return c.promise;
  const promise = dbFetch('/db/holder-stats').then(j => {
    if(!j || !j.ok) throw new Error(j?.error || 'holder stats unavailable');
    const map = new Map();
    for(const r of j.rows){
      const o = {};
      j.fields.forEach((f, i) => { o[f] = r[i]; });
      map.set(String(o.wallet).toLowerCase(), o);
    }
    return { map, currency: j.currency || 'ETH', complete: !!j.transfersComplete };
  });
  window._holderStats = { slug, promise };
  promise.catch(() => { if(window._holderStats?.promise === promise) window._holderStats = null; });
  return promise;
}
function _fmtHoldDays(d){
  if(d < 1) return '<1d';
  if(d < 90) return Math.round(d) + 'd';
  if(d < 365) return Math.round(d / 30.4) + 'mo';
  return (d / 365).toFixed(1) + 'y';
}
function _fmtAmt(n){
  const a = Math.abs(n);
  return a >= 100 ? n.toFixed(0) : a >= 1 ? n.toFixed(2) : n.toFixed(3);
}
async function _renderRankedHolders(gridEl, matches){
  const rank = window._holderRank;
  const d = window._holdersData;
  gridEl.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:8px 0">Loading holder insights…</div>';
  let st;
  try{ st = await _ensureHolderStats(); }
  catch(e){
    console.warn('[holder-stats]', e.message);
    gridEl.innerHTML = '<div style="color:var(--sub);font-size:12px;padding:8px 0">Holder insights aren\'t available for this collection yet.</div>';
    return;
  }
  if(window._holderRank !== rank) return; // tapped another pill meanwhile
  const cur = st.currency;
  const heldMap = new Map((d?.sorted_wallets || []).map(w => [String(w.wallet).toLowerCase(), w]));
  let list;
  if(matches) list = matches.map(w => ({ addr: String(w.wallet).toLowerCase(), h: w, s: st.map.get(String(w.wallet).toLowerCase()) }));
  else if(rank === 'hold') list = (d?.sorted_wallets || []).map(w => ({ addr: String(w.wallet).toLowerCase(), h: w, s: st.map.get(String(w.wallet).toLowerCase()) }));
  else list = [...st.map.values()].map(s => ({ addr: s.wallet, h: heldMap.get(s.wallet), s }));
  const val = {
    hold: s => s.avgHoldDays, mint: s => s.minted, bought: s => s.bought, sold: s => s.sold,
    pnlBest: s => s.pnl, pnlWorst: s => -s.pnl,
  }[rank];
  const tie = { bought: s => s.boughtVol, sold: s => s.soldVol, hold: s => s.longestHoldDays, mint: s => s.held }[rank] || (() => 0);
  list = list.filter(x => x.s && (rank === 'pnlBest' ? x.s.flips && x.s.pnl > 0 : rank === 'pnlWorst' ? x.s.flips && x.s.pnl < 0 : val(x.s) > 0));
  list.sort((a, b) => (val(b.s) - val(a.s)) || (tie(b.s) - tie(a.s)));
  const lim = window._holderLimit || 100;
  const total = list.length;
  list = list.slice(0, lim === 'all' ? list.length : Number(lim));

  let note = '';
  if((rank === 'hold' || rank === 'mint') && !st.complete) note = 'Transfer history is still syncing, so hold times and minters are incomplete for now.';
  else if(rank === 'pnlBest' || rank === 'pnlWorst') note = `Realized P&amp;L on tokens a wallet bought and later sold, before fees. Minted or transferred-in tokens aren't counted.`;
  else if(rank === 'hold') note = 'Average time each wallet has held the tokens it owns now.';
  const noteHtml = note ? `<div style="font-size:10px;color:var(--sub);opacity:.8;padding:0 2px 6px">${note}</div>` : '';

  if(!list.length){
    gridEl.innerHTML = noteHtml + '<div style="color:var(--sub);font-size:12px;padding:8px 0">No wallets to rank here yet.</div>';
    return;
  }
  const maxV = Math.max(...list.map(x => Math.abs(val(x.s)))) || 1;
  gridEl.innerHTML = noteHtml + list.map((x, i) => {
    const s = x.s, addr = x.addr;
    const short = addr.slice(0, 6) + '…' + addr.slice(-4);
    const heldNow = x.h ? x.h.count : s.held;
    const barW = Math.max(2, Math.round(Math.abs(val(s)) / maxV * 100));
    const pos = s.pnl >= 0;
    let main, extra = [];
    if(rank === 'hold'){ main = `<b style="color:var(--text)">${_fmtHoldDays(s.avgHoldDays)}</b> avg hold`; extra.push(`longest ${_fmtHoldDays(s.longestHoldDays)}`); }
    else if(rank === 'mint'){ main = `<b style="color:var(--text)">${s.minted}</b> minted`; }
    else if(rank === 'bought'){ main = `<b style="color:var(--text)">${s.bought}</b> bought`; extra.push(`${_fmtAmt(s.boughtVol)} ${cur} spent`); }
    else if(rank === 'sold'){ main = `<b style="color:var(--text)">${s.sold}</b> sold`; extra.push(`${_fmtAmt(s.soldVol)} ${cur} received`); }
    else { main = `<b style="color:${pos ? '#2dd4bf' : '#f87171'}">${pos ? '+' : ''}${_fmtAmt(s.pnl)} ${cur}</b> P&amp;L`; extra.push(`${s.flips} flip${s.flips === 1 ? '' : 's'}${s.lossFlips ? `, ${s.lossFlips} at a loss` : ''}`); }
    extra.push(`${heldNow} held now`);
    if(x.h && x.h.matchCount) extra.push(`<span style="color:#2dd4bf">${x.h.matchCount} matching</span>`);
    return `<div style="padding:6px 8px;border-radius:8px;background:color-mix(in srgb, var(--text) 3%, transparent);border:1px solid color-mix(in srgb, var(--text) 5%, transparent);margin-bottom:2px;cursor:pointer" onclick="openWalletView('${addr}')">
      <div style="display:grid;grid-template-columns:18px 1fr auto;gap:6px;align-items:center;margin-bottom:4px">
        <span style="font-size:10px;color:var(--sub);font-weight:600">${i + 1}</span>
        <span style="font-family:monospace;font-size:11px;color:var(--text)">${short}</span>
        <a href="https://opensea.io/${addr}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-size:10px;color:var(--sub);opacity:.6">↗</a>
      </div>
      <div style="height:3px;border-radius:2px;background:color-mix(in srgb, var(--text) 8%, transparent);overflow:hidden;margin-bottom:5px">
        <div style="height:100%;width:${barW}%;background:${rank === 'pnlWorst' ? 'linear-gradient(90deg,#f87171,#fb923c)' : 'linear-gradient(90deg,#2dd4bf,#7c5cff)'};border-radius:2px"></div>
      </div>
      <div style="display:flex;gap:10px;font-size:10px;color:var(--sub);flex-wrap:wrap"><span>${main}</span>${extra.map(e => `<span>${e}</span>`).join('')}</div>
    </div>`;
  }).join('') + (total > list.length ? `<div style="font-size:10px;color:var(--sub);padding:6px 2px">Showing ${list.length} of ${total}</div>` : '');
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
  _renderHolderRankBar();

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
      `<div style="text-align:center;min-width:52px"><div style="font-size:16px;font-weight:800;color:var(--tc-38bdf8)">${d.top100Pct||'–'}%</div><div style="font-size:9px;color:var(--sub);white-space:nowrap">Top 100</div></div>`,
      `<div style="text-align:center;min-width:52px"><div style="font-size:16px;font-weight:800;color:#d8b4fe">${d.diamonds}</div><div style="font-size:9px;color:var(--sub);white-space:nowrap">Hold 5+</div></div>`,
      d.burnedCount ? `<div style="text-align:center;min-width:52px"><div style="font-size:16px;font-weight:800;color:var(--tc-f87171)">${d.burnedCount.toLocaleString()}</div><div style="font-size:9px;color:var(--sub);white-space:nowrap">Burned</div></div>` : '',
    ].join('');
  }



  // Limit toggle bar
  const limitBar = document.getElementById('holderLimitBar');
  if(limitBar){
    const cur = window._holderLimit || 100;
    limitBar.innerHTML = [10, 100, 'all'].map(val => {
      const label = val === 'all' ? 'All' : `Top ${val}`;
      const active = String(cur) === String(val);
      return `<button onclick="window._holderLimit='${val}';renderHolders()" style="font-size:10px;padding:2px 8px;border-radius:999px;border:1px solid color-mix(in srgb, var(--text) ${active?'30%':'8%'}, transparent);background:color-mix(in srgb, var(--text) ${active?'12%':'3%'}, transparent);color:${active?'var(--text)':'var(--sub)'};cursor:pointer">${label}</button>`;
    }).join('');
  }

  // Top holders list
  const gridEl = document.getElementById('holdersGrid');
  if(gridEl && (window._holderRank || 'held') !== 'held') return _renderRankedHolders(gridEl, null);
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
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--sub);font-size:9px">#${id}</div>`;
        return `<div
          style="width:38px;height:38px;border-radius:5px;overflow:hidden;border:1px solid color-mix(in srgb, var(--text) 12%, transparent);background:var(--soft);cursor:pointer;flex-shrink:0;position:relative"
          onclick="event.stopPropagation();openModal(${id})"
          onmouseenter="_holderThumbEnter(${id},event.clientX,event.clientY)"
          onmouseleave="_hideChartTooltip('_holderThumbTT')"
        >${imgTag}</div>`;
      }).join('');

      return `<div style="padding:6px 8px;border-radius:8px;background:color-mix(in srgb, var(--text) 3%, transparent);border:1px solid color-mix(in srgb, var(--text) 5%, transparent);margin-bottom:2px;cursor:pointer"
        onclick="openWalletView('${addr}')">
        <div style="display:grid;grid-template-columns:18px 1fr auto;gap:6px;align-items:center;margin-bottom:4px;cursor:pointer">
          <span style="font-size:10px;color:var(--sub);font-weight:600">${i+1}</span>
          <span style="font-family:monospace;font-size:11px;color:var(--text)">${short}</span>
          <a href="${osUrl}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-size:10px;color:var(--sub);opacity:.6">↗</a>
        </div>
        <div style="height:3px;border-radius:2px;background:color-mix(in srgb, var(--text) 8%, transparent);overflow:hidden;margin-bottom:5px">
          <div style="height:100%;width:${barW}%;background:linear-gradient(90deg,#2dd4bf,#7c5cff);border-radius:2px"></div>
        </div>
        <div style="display:flex;gap:10px;font-size:10px;color:var(--sub);flex-wrap:wrap;margin-bottom:${listedIds.length>0?'6px':'0'}">
          <span><b style="color:var(--text)">${w.count}</b> tokens (${pct}%)</span>
          ${estVal ? `<span>≈ <b style="color:#2dd4bf">${estVal} ETH</b></span>` : ''}
          ${listedCount > 0 ? `<span><b style="color:var(--tc-f59e0b)">${listedCount}</b> listed</span>` : '<span style="opacity:.5">none listed</span>'}
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
