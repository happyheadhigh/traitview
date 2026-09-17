/* TraitView config/constants.
   Loaded before app.js.
   Keep this as a classic script, not an ES module. */

/* live settings — Cloudflare Worker proxy, shared across every collection */
const LIVE_ENDPOINT = 'https://nft-live-listings.jvweb3.workers.dev';

/* ── Collections registry ─────────────────────────────────────────────────
   Each collection can genuinely live on a different backend service --
   confirmed live that OCAS's own data lives exclusively in a separate,
   older, OCAS-only Railway service/database (no collections table, no
   multi-collection schema at all -- predates that architecture entirely),
   while newer collections like Argonauts live in the newer, multi-collection-
   aware tv-bot-api-production service instead. Rather than attempt to
   consolidate two live, separate production databases (a much bigger,
   riskier project on its own), each collection entry carries its own
   apiBase/apiKey so the frontend can route requests to wherever that
   collection's data actually is.

   hasBurnMechanic gates the OCAS-only burn UI (Burns tab, survivor counts,
   burn history, etc.) -- these features only exist for OCAS's own token
   lifecycle and must not be shown/attempted for any other collection. */
/* jv's bot invite link -- same for every collection regardless of which
   community/server it's for, since this invites the bot itself rather than
   linking to any one collection's own Discord server. Every collection's
   menu Discord row points here, not to a per-collection Discord invite. */
const BOT_DISCORD_INVITE_URL = 'https://discord.com/oauth2/authorize?client_id=1539291253370261635&permissions=268486656&integration_type=0&scope=bot+applications.commands';

const COLLECTIONS = {
  'on-chain-all-stars': {
    slug: 'on-chain-all-stars',
    name: 'On-Chain All Stars',
    contract: '0x078be86f3104a32313a47815792230a3808642cc',
    chain: 'ethereum',
    apiBase: 'https://ocas-production-api-production.up.railway.app',
    apiKey: 'APIbot2k26MAINprodOCAS',
    hasBurnMechanic: true,
    openseaUrl: 'https://opensea.io/collection/on-chain-all-stars',
    websiteUrl: 'https://onchainallstars.xyz',
    twitterUrl: 'https://twitter.com/onchainallstars',
  },
  'argonauts': {
    slug: 'argonauts',
    name: 'Argonauts',
    contract: '0x387c41b0b2f1128de44db1bcf8baad085f26392c',
    chain: 'ethereum',
    apiBase: 'https://tv-bot-api-production.up.railway.app',
    apiKey: 'TraitViewBot2k26',
    hasBurnMechanic: false,
    // jv confirmed live: Bones/Palette/Print are the three always-present
    // base attributes every Argonaut has regardless of what's worn (a
    // "bare" Argonaut has only these three). Fate ("Burned") is a fourth,
    // separate case -- unconditionally tied to burn status in the
    // renderer's own verified source (only appended when isDead(tokenId)
    // is true), so it's excluded the same way.
    //
    // CORRECTION: Relic was wrongly included in this list for one round --
    // token #5207 has Relic:Gold with NO Fate at all (confirmed not
    // burned), disproving the original theory that Relic was a second
    // burn-only marker. That theory came from only ever having checked two
    // tokens, both of which happened to be burned and have both fields --
    // coincidence, not causation. Relic is a genuine (just rare) worn
    // trait slot like Cloak/Crown/Sight/Artifact -- its "1 values" in the
    // filter panel means every occurrence happens to be "Gold" so far, not
    // that only one token has it. It counts normally now.
    nonWornTraitCategories: ['Bones', 'Palette', 'Print', 'Fate'],
    openseaUrl: 'https://opensea.io/collection/argonauts',
    // Confirmed via /db/collections/backfill-links: OpenSea's own collection
    // page for Argonauts genuinely has no website/external_url set at all --
    // null here is correct, not a placeholder waiting to be filled in, so
    // the menu correctly keeps hiding that row rather than showing a wrong
    // or fabricated link.
    websiteUrl: null,
    twitterUrl: 'https://twitter.com/lphaCentauriKid',
  },
};
const DEFAULT_COLLECTION_SLUG = 'on-chain-all-stars';

/* jv: "I'd like it to pull its collection list from the backend
   automatically" -- rather than only ever knowing about whatever's
   hardcoded above. OCAS itself can't be discovered this way (it lives on
   a separate, older service with no collections table at all -- see the
   comment on COLLECTIONS above), so it stays hardcoded as the permanent
   baseline. But every other collection -- Argonauts today, anything
   onboarded after it -- lives in tv-bot-api-production's own `collections`
   table, and that table is exactly what /db/collections/onboard populates
   as a collection moves through backfill to 'ready'. This fetches that
   list directly and merges in anything not already known, so a newly
   onboarded collection can show up on the site without a code change or
   redeploy here at all -- just the bot-side onboarding finishing.

   Deliberately NOT awaited by activateCollection()'s own very first,
   synchronous call in app.js -- that call has to stay synchronous (it's
   the very first line of the app's bootstrap, before anything else can
   run), and the two entries hardcoded above are guaranteed to resolve
   correctly without needing this fetch at all. This runs in parallel
   instead: if the requested slug wasn't in the hardcoded baseline, the
   page still loads immediately (falling back to the default collection),
   and if this fetch later confirms that slug is real, the caller can
   switch to it once it's known -- see the call site in app.js for how
   that handoff works. */
const TV_BOT_API_BASE = COLLECTIONS['argonauts'].apiBase;
const TV_BOT_API_KEY  = COLLECTIONS['argonauts'].apiKey;
async function loadDynamicCollections(){
  try{
    const r = await fetch(`${TV_BOT_API_BASE}/db/collections?key=${encodeURIComponent(TV_BOT_API_KEY)}`);
    if(!r.ok) return [];
    const j = await r.json();
    if(!j.ok || !Array.isArray(j.collections)) return [];
    const newlyAdded = [];
    for(const row of j.collections){
      if(row.status !== 'ready') continue; // still backfilling, or failed -- not ready to show
      const slug = String(row.slug || '').toLowerCase();
      if(!slug) continue;
      if(COLLECTIONS[slug]){
        // Confirmed live: jv ran /db/collections/backfill-links for
        // Argonauts (already a hardcoded baseline entry, not newly
        // discovered) and the site never picked up the result -- this loop
        // used to skip already-known collections entirely, so a baseline
        // entry's links could only ever be updated by hand-editing this
        // file again. Refreshing just the link fields for anything already
        // known (never touching apiBase/apiKey/hasBurnMechanic, which
        // aren't sourced from this endpoint) means a future backfill-links
        // run picks up automatically on next page load instead.
        COLLECTIONS[slug].openseaUrl = row.opensea_url || COLLECTIONS[slug].openseaUrl;
        COLLECTIONS[slug].websiteUrl = row.website_url || null;
        COLLECTIONS[slug].twitterUrl = row.twitter_url || null;
        continue;
      }
      COLLECTIONS[slug] = {
        slug,
        name: row.name || slug,
        contract: row.contract,
        // jv confirmed live on nekoadz (Robinhood Chain): the Worker calls
        // this feeds now support a real ?chain= param, but nothing here
        // ever tracked which chain a collection is actually on -- every
        // dynamically-discovered collection silently defaulted to
        // ethereum everywhere downstream. row.chain comes straight from
        // the collections table (chain TEXT NOT NULL DEFAULT 'ethereum'),
        // so this is real per-collection data, not a guess.
        chain: row.chain || 'ethereum',
        apiBase: TV_BOT_API_BASE,
        apiKey: TV_BOT_API_KEY,
        // Burn mechanic is a real, distinct token lifecycle feature specific
        // to OCAS, not something a generic onboarding flow can infer from
        // OpenSea metadata alone -- false is the only safe default for any
        // collection discovered this way.
        hasBurnMechanic: false,
        openseaUrl: row.opensea_url || `https://opensea.io/collection/${slug}`,
        websiteUrl: row.website_url || null,
        twitterUrl: row.twitter_url || null,
      };
      newlyAdded.push(slug);
    }
    return newlyAdded;
  }catch(e){
    console.warn('[Collections] dynamic collections list fetch failed:', e.message);
    return [];
  }
}

/* ── Currently-active collection state ────────────────────────────────────
   These four used to be frozen `const` values, hardcoded to OCAS. They're
   now `let`, set by activateCollection() below -- everywhere else in the
   codebase that reads LIVE_SLUG/LIVE_CONTRACT/RAILWAY_API/RAILWAY_KEY
   already treats them as the single source of truth for "which collection
   am I looking at right now," so switching collections is just a matter of
   reassigning these four and re-triggering the normal data-load flow --
   no per-call-site changes needed elsewhere. */
let LIVE_SLUG = null;
let LIVE_CONTRACT = null;
let RAILWAY_API = null;
let RAILWAY_KEY = null;
// jv confirmed live on nekoadz (Robinhood Chain): every Worker call this
// site makes either omitted chain entirely or hardcoded "ethereum" --
// nothing tracked which chain the active collection is actually on at
// all. Added to the exact same single-source-of-truth set as the other
// four so every existing call site's pattern (read LIVE_SLUG/LIVE_CONTRACT
// directly) extends the same way for chain, no new indirection needed.
let LIVE_CHAIN = 'ethereum';

/* FAVORITES_KEY intentionally stays collection-scoped (appended per-slug at
   use, not defined once here) so favoriting a token in one collection never
   collides with another collection's token IDs -- confirmed live this
   exact class of bug already happened once before (cross-collection image
   collision, numerically-colliding token_id treated as the wrong
   collection's token) and burned real debugging time then. See
   favoriteKeyFor() in favorites.js. */
const FAVORITES_VIEW_KEY = 'traitview_favorites_only';
const CONNECTED_WALLET_KEY = 'traitview_connected_wallet_v1';
// jv: TraitView's Connected Holder section and wallet tab need to be aware
// when a token actually moves in that wallet. The underlying fetch
// (fetchWalletTokenIdsForAddress -> the Worker's /nft/wallet) is already a
// live, uncached Alchemy call with no server-side staleness of its own --
// this browser-side cache was the only real remaining delay. Shortened
// from 10 minutes to 30 seconds: still avoids a redundant live call on
// every rapid re-render, but no longer sits on stale holdings for most of
// a visit the way a 10-minute window could.
const CONNECTED_WALLET_CACHE_TTL = 30 * 1000;

/* Sets LIVE_SLUG/LIVE_CONTRACT/RAILWAY_API/RAILWAY_KEY for the given
   collection slug, falling back to DEFAULT_COLLECTION_SLUG for an unknown
   or missing slug rather than leaving state half-set. Does NOT itself
   clear per-collection caches or re-trigger a data reload -- callers
   (the URL-routing bootstrap, and the collection-switcher UI) are
   responsible for that, since they know whether this is the very first
   activation on page load (nothing to clear yet) or a live switch
   mid-session (plenty to clear). */
function activateCollection(slug){
  const entry = COLLECTIONS[slug] || COLLECTIONS[DEFAULT_COLLECTION_SLUG];
  LIVE_SLUG = entry.slug;
  LIVE_CONTRACT = entry.contract;
  LIVE_CHAIN = entry.chain || 'ethereum';
  RAILWAY_API = entry.apiBase;
  RAILWAY_KEY = entry.apiKey;
  updateMenuLinks(entry);
  return entry;
}

/* jv: "The links in the hamburger menu are for OCAS. Is it possible to
   update the links per collection whenever a collection is added?" Updates
   both the desktop header icons and the mobile hamburger menu rows to
   match whichever collection is now active. OpenSea/Website/Twitter come
   from the collection's own entry (hardcoded for OCAS, fetched from
   OpenSea's own collection metadata at onboarding time for everything
   else -- see lib/collection-onboard.js on the backend); a link this
   collection genuinely doesn't have (most commonly Website/Twitter for a
   project that never filled those in on OpenSea) hides that row entirely
   rather than showing a broken/wrong link. Etherscan is always derivable
   from the contract address alone, so it's always shown. Discord is
   deliberately NOT per-collection -- jv wants every collection's menu to
   point at the bot's own invite link, not any individual community's own
   Discord server. */
function updateMenuLinks(entry){
  const etherscanUrl = `https://etherscan.io/token/${entry.contract}`;
  const links = [
    { key: 'openseaUrl', url: entry.openseaUrl, desktopClass: 'os', mobileId: 'mobileMenuLinkOS' },
    { key: 'websiteUrl', url: entry.websiteUrl, desktopClass: 'web', mobileId: 'mobileMenuLinkWeb' },
    { key: 'twitterUrl', url: entry.twitterUrl, desktopClass: 'twitter', mobileId: 'mobileMenuLinkTwitter' },
    { key: 'etherscanUrl', url: etherscanUrl, desktopClass: 'etherscan', mobileId: 'mobileMenuLinkEtherscan' },
    { key: 'discordUrl', url: BOT_DISCORD_INVITE_URL, desktopClass: 'bot', mobileId: 'mobileMenuLinkDiscord' },
  ];
  for(const link of links){
    const desktopEl = document.querySelector(`.desktop-icon-link.${link.desktopClass}`);
    const mobileEl = document.getElementById(link.mobileId);
    const show = !!link.url;
    // jv: "on the desktop the website for argonauts is going to ocas
    // website" -- confirmed live: .desktop-icon-link's own CSS sets
    // display:inline-flex!important. A plain style.display='none' from JS
    // can never override a stylesheet !important rule (only another
    // !important wins) -- every hide attempt here was silently a no-op,
    // leaving every desktop icon permanently visible regardless of
    // whether this collection actually has that link. Worse, href was
    // only ever updated in the show branch, so a hidden-but-still-visible
    // icon kept whatever href the PREVIOUS collection had set (OCAS's own
    // website, if that was the first collection loaded this session) --
    // exactly the bug reported. setProperty's third argument can override
    // an !important stylesheet rule from JS, which plain assignment
    // cannot; href now always gets set (to the real url, or stripped
    // entirely when there isn't one) regardless of visibility, so a link
    // can never silently retain a stale target from a different collection.
    if(desktopEl){
      desktopEl.style.setProperty('display', show ? 'inline-flex' : 'none', 'important');
      if(show) desktopEl.href = link.url; else desktopEl.removeAttribute('href');
    }
    if(mobileEl){
      mobileEl.style.display = show ? '' : 'none';
      if(show) mobileEl.href = link.url; else mobileEl.removeAttribute('href');
    }
  }
}

/* Read once at load time so app.js's bootstrap can call activateCollection
   with the right initial slug before anything else runs. Supports both a
   query param (?collection=argonauts) and the existing /token/:slug/:id
   path pattern jv's Discord bot's own download-button links already use
   (traitview.com/token/argonauts/1315) -- confirmed live that pattern is
   already in production use, so it must resolve the right collection, not
   just the query-param form. */
function collectionSlugFromUrl(){
  const params = new URLSearchParams(window.location.search);
  if(params.has('collection')) return params.get('collection');
  const pathMatch = window.location.pathname.match(/^\/token\/([^\/]+)\/\d+/);
  if(pathMatch) return pathMatch[1];
  return null;
}

/* Fills every collection-switcher <select> from the registry (desktop's
   #collectionSwitcher AND mobile's #collectionSwitcherMobile -- confirmed
   live that the desktop one was completely invisible on mobile, nested
   inside #desktopBottomStatusBar which is display:none by default and only
   shown via a min-width:901px media query, so mobile needed its own,
   separate switcher element entirely), selecting whichever collection is
   currently active. Called once from init(), right after
   activateCollection() runs, so LIVE_SLUG already reflects the real
   current collection by the time this reads it. */
function populateCollectionSwitcher(){
  for(const selId of ['collectionSwitcher', 'collectionSwitcherMobile']){
    const sel = document.getElementById(selId);
    if(!sel) continue;
    sel.innerHTML = '';
    for(const slug in COLLECTIONS){
      const opt = document.createElement('option');
      opt.value = slug;
      opt.textContent = COLLECTIONS[slug].name;
      if(slug === LIVE_SLUG) opt.selected = true;
      sel.appendChild(opt);
    }
  }
}

/* Resets every piece of per-collection global state this app accumulates,
   cataloged by systematically grepping every `let`/`const` in appState.js
   and every top-level `window.X =` assignment across every JS file --
   confirmed via that search this app has 50+ distinct pieces of mutable
   global state across more than a dozen files, all originally designed
   assuming a single collection for the page's entire lifetime. Called
   before re-invoking init() for an in-place collection switch (no reload)
   -- without this, stale data from the previous collection (a rank map, a
   chunk cache entry, a "listings already loaded" guard flag) would either
   silently persist into the new collection's view or block its own fresh
   data from ever loading at all.

   Deliberately does NOT reset: CONNECTED_WALLET (wallet connection is a
   user-level fact, not collection-scoped), SALES_VIEW/MISPRICED_VIEW/
   MISPRICED_MODE (view-mode preferences the user chose, not data), or
   theme (persisted separately, unrelated to collection). */
function resetCollectionState(){
  // Confirmed live via jv's own diagnostic: raw API response for a token
  // had a genuinely valid image value at fetch time, yet the same token
  // showed undefined by the time it actually rendered -- ruling out a data
  // gap entirely. Root cause: nothing here ever guarded against multiple
  // /db/all-traits fetches overlapping in flight (initial page load for the
  // default collection, then a switch to another collection before that
  // first fetch resolves) -- whichever one resolved LAST silently won,
  // overwriting CHUNK_CACHE with whatever collection ITS fetch was for,
  // regardless of which collection was actually active by then. This
  // generation counter, incremented on every switch, lets the all-traits
  // fetch below detect and discard its own result if a newer switch already
  // happened while it was in flight.
  window._collectionGeneration = (window._collectionGeneration || 0) + 1;

  // appState.js -- `let` declarations, safe to reassign directly
  window.LISTINGS = {};
  LIVE_OK = false;
  MANIFEST = null; CHUNK_SIZE = 1000; CHUNKS_DIR = 'traits_chunks'; TOKEN_COUNT = 0;
  TRAIT_FREQ = {}; TRAIT_DOMAIN = {}; MAX_TRAIT_COUNT = 0;
  currentTraitCount = null; AVAILABLE_DOMAIN = null;
  RARITY_MODE = 'observed'; PROB_DATA = null;
  pinnedA = null; pinnedB = null; pinnedSet = [];
  CHART_ID_MAP = {};
  rankMin = null; rankMax = null;

  // appState.js -- `const` Maps/Sets, must .clear() rather than reassign
  CHUNK_CACHE.clear(); ROW_CACHE.clear();
  activeTraits.clear();
  RARITY_OBS_RANK.clear(); RARITY_THEO_RANK.clear();
  OS_RANK_MAP.clear();
  SURVIVOR_COUNT_MAP.clear();
  OPEN_GROUPS.clear();
  LAST_SALE_CACHE.clear(); LAST_SALE_PENDING.clear();

  // jv: Argonauts' Sales tab was showing OCAS's sales. See app.js's own
  // sales IIFE for the two-part fix -- this clears the already-loaded
  // stale-collection sales and forces a fresh fetch for whichever
  // collection is now active.
  if(typeof window.resetSalesState === 'function') window.resetSalesState();

  // Confirmed live via jv's own per-chunk diagnostic: CHUNK_CACHE itself was
  // 100% complete for every real token -- this was never a data problem at
  // all. The actual bug: VS's own DOM-node reuse cache keys tiles as
  // `${mode}:${id}` -- collection is never part of that key. A tile built
  // while viewing one collection (with THAT collection's image baked into
  // its <img> src) gets silently reused by the SAME numeric id under a
  // different collection, since token ids commonly overlap across
  // collections (both OCAS and Argonauts have their own token #907, etc).
  // This exactly explains the pattern jv isolated: browsing by id (Live
  // Listings off) mostly hits ids never rendered yet this session, while
  // sorting by price (Live Listings on) pulls a scattered set of ids that
  // can easily overlap with whatever got cached during the brief initial
  // page load for the previous collection.
  if(typeof VS !== 'undefined' && VS._nodeCache) VS._nodeCache.clear();

  // Confirmed live: several other caches share the exact same vulnerability
  // as VS._nodeCache above -- keyed purely by token id, with no awareness
  // of which collection that id belonged to when it was cached. Clearing
  // proactively here, before the same bug shows up in one of these too --
  // low risk, since the only cost is a few extra re-fetches right after a
  // switch, not a correctness issue.
  if(typeof _OWNER_CACHE !== 'undefined') _OWNER_CACHE.clear();
  if(typeof _burnHistoryCache !== 'undefined') _burnHistoryCache.clear();
  if(typeof MARKET_TAG_CACHE !== 'undefined') MARKET_TAG_CACHE.clear();
  if(typeof HOLDER_TAG_CACHE !== 'undefined') HOLDER_TAG_CACHE.clear();
  if(typeof priceHistoryCache !== 'undefined') priceHistoryCache.clear();
  if(typeof tokenHistoryCache !== 'undefined') tokenHistoryCache.clear();
  // jv: "I'm not getting any combo intelligence for other collections."
  // COMBO_ROWS_CACHE (comboInsights.js) is a one-time, module-level cache --
  // once ensureComboRows() populates it for whichever collection happens to
  // be active the first time a token modal's Rarity tab is opened, it was
  // never reset here on a live collection switch, unlike every other
  // per-collection cache right above it. Every subsequent comboCount() call
  // for any OTHER collection kept matching against that first collection's
  // stale trait rows -- which, for a differently-named trait schema (e.g.
  // Argonauts' Sight/Crown/Bones vs. whatever was cached first), essentially
  // never matches, so every combo count came back 0 and no insight ever
  // cleared its own minimum-count threshold. COMBO_COUNT_CACHE and
  // COMBO_INSIGHT_CACHE are keyed in ways that would also silently carry
  // stale, wrong-collection answers forward otherwise.
  if(typeof COMBO_ROWS_CACHE !== 'undefined'){ COMBO_ROWS_CACHE.ready = false; COMBO_ROWS_CACHE.promise = null; COMBO_ROWS_CACHE.rows = []; }
  if(typeof COMBO_COUNT_CACHE !== 'undefined') COMBO_COUNT_CACHE.clear();
  if(typeof COMBO_INSIGHT_CACHE !== 'undefined') COMBO_INSIGHT_CACHE.clear();

  // imageMap.js
  if(typeof IMAGES_MAP !== 'undefined' && IMAGES_MAP) IMAGES_MAP.clear();

  // app.js window.* globals -- data caches
  window._BURNED_IDS = new Set();
  window._fastBuckets = {};
  window._fastIdByCount = {};
  window.SURVIVOR_IMAGE_MAP = new Map();
  window.OS_RANK_MAP = OS_RANK_MAP;
  window.SURVIVOR_COUNT_MAP = SURVIVOR_COUNT_MAP;
  window.CHUNK_SIZE = CHUNK_SIZE;
  window.TOKEN_COUNT = TOKEN_COUNT;
  window._floorEvents = [];
  window._floorLoaded = false;
  window._floorHistory = null;
  window._floorDays = 30;
  window._holdersLoaded = false;
  window._holdersData = null;
  window._walletTokenIds = null;
  window._mobileWalletIds = null;
  window._desktopWalletIds = null;
  window._desktopWalletIdsFiltered = null;
  window.LAST_IDS = [];
  window._holderThumbs = {};
  window.__TOKEN_ID_EXACT_SEARCH__ = false;
  window._modalBurnHistory = null;
  window._TV_LAST_DOWNLOAD_NFT = null;

  // app.js window.* globals -- bootstrap/loading guard flags (must reset
  // to false so the equivalent fetches actually re-fire for the new
  // collection instead of silently no-op'ing because "already started")
  window.__LISTINGS_BOOTSTRAP_STARTED__ = false;
  window.__LISTINGS_READY__ = false;
  window._scatterReady = false;
  window.__INIT_LOADING__ = false;
  window._chunksReady = false;

  // Clear any DOM left over from the previous collection so nothing
  // stale is visible while the new collection's data is still loading.
  const grid = document.getElementById('tokenGrid');
  if(grid) grid.innerHTML = '';
  const salesGrid = document.getElementById('salesGrid');
  if(salesGrid) salesGrid.innerHTML = '';
}

/* Called by the switcher's onchange. Genuinely switches in place now --
   no page reload -- since resetCollectionState() above explicitly clears
   every piece of per-collection state this app accumulates, and init()
   itself was confirmed to attach zero event listeners directly (the one
   thing that would have made re-invoking it unsafe), so re-running it is
   safe. Updates the URL via history.pushState so the address bar reflects
   the new collection and the back button works, without triggering an
   actual navigation. */
function switchCollection(slug){
  const sels = ['collectionSwitcher', 'collectionSwitcherMobile']
    .map(id => document.getElementById(id))
    .filter(Boolean);
  sels.forEach(sel => { sel.disabled = true; });
  history.pushState({}, '', `/?collection=${encodeURIComponent(slug)}`);
  _applyCollectionSwitch(slug).finally(() => { sels.forEach(sel => { sel.disabled = false; }); });
}

/* Shared by switchCollection() (user picked a new collection from the
   dropdown) and the popstate handler below (browser back/forward button) --
   everything switchCollection() does except the URL update itself, since
   for popstate the URL has already changed by the time this runs. */
function _applyCollectionSwitch(slug){
  activateCollection(slug);
  resetCollectionState();
  populateCollectionSwitcher();
  applyCollectionFeatureGating();
  // Confirmed live: jv reported the header stats bar (floor, volume,
  // sales, 24h, owners) never actually switching over on a collection
  // change -- traced to a separate, page-load-only IIFE in app.js that
  // only ever fetched once and then relied purely on its own multi-minute
  // setInterval timers after that. activateCollection() above already
  // updated LIVE_SLUG/LIVE_CONTRACT synchronously, so this can fire
  // immediately, in parallel with init() below, rather than waiting on it
  // -- the header refresh doesn't depend on the grid finishing its own
  // (potentially slower) load.
  if(typeof window.refreshHeaderStats === 'function') window.refreshHeaderStats();
  return Promise.resolve(init()).then(() => {
    if(typeof refreshConnectedWalletForCollectionSwitch === 'function') return refreshConnectedWalletForCollectionSwitch();
  });
}

/* Confirmed live: jv reported stats bar and grid showing two DIFFERENT
   collections' data simultaneously (OCAS stats, Argonauts grid tiles) --
   traced to this being completely missing. switchCollection() updates the
   URL via history.pushState(), but nothing ever listened for the
   corresponding popstate event the browser fires on back/forward
   navigation. On iOS Safari specifically, going back can restore the page
   from memory (old DOM, including stale grid tiles from before the button
   press) while the URL itself changes to the previous collection -- with no
   listener, nothing here ever re-synced the app's actual state (LIVE_SLUG,
   CHUNK_CACHE, etc.) to match, leaving stats/data partially updated by
   whatever else happened to notice the URL change, and the grid left
   entirely stale. */
window.addEventListener('popstate', () => {
  const slug = collectionSlugFromUrl();
  // activateCollection() already resolves a falsy/unknown slug to the
  // default collection on its own -- comparing against COLLECTIONS[slug]'s
  // resolved value (not the raw slug itself) so navigating back to a plain,
  // no-param URL still correctly re-syncs to the default collection rather
  // than silently doing nothing just because slug itself was null.
  const resolvedSlug = (COLLECTIONS[slug] || COLLECTIONS[DEFAULT_COLLECTION_SLUG]).slug;
  if(resolvedSlug !== LIVE_SLUG){
    _applyCollectionSwitch(resolvedSlug);
  }
});

/* Hides UI that only makes sense for collections with hasBurnMechanic:true
   (currently just OCAS -- Argonauts and any future collection have no burn
   lifecycle at all). Called once from init(), after activateCollection()
   has set LIVE_SLUG for real. */
function applyCollectionFeatureGating(){
  const entry = COLLECTIONS[LIVE_SLUG];
  const hasBurn = entry ? entry.hasBurnMechanic : false;
  const burnsBtn = document.getElementById('burnsTabBtn');
  if(burnsBtn) burnsBtn.style.display = hasBurn ? '' : 'none';
}
