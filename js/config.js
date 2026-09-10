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
const COLLECTIONS = {
  'on-chain-all-stars': {
    slug: 'on-chain-all-stars',
    name: 'On-Chain All Stars',
    contract: '0x078be86f3104a32313a47815792230a3808642cc',
    apiBase: 'https://ocas-production-api-production.up.railway.app',
    apiKey: 'APIbot2k26MAINprodOCAS',
    hasBurnMechanic: true,
  },
  'argonauts': {
    slug: 'argonauts',
    name: 'Argonauts',
    contract: '0x387c41b0b2f1128de44db1bcf8baad085f26392c',
    apiBase: 'https://tv-bot-api-production.up.railway.app',
    apiKey: 'TraitViewBot2k26',
    hasBurnMechanic: false,
  },
};
const DEFAULT_COLLECTION_SLUG = 'on-chain-all-stars';

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

/* FAVORITES_KEY intentionally stays collection-scoped (appended per-slug at
   use, not defined once here) so favoriting a token in one collection never
   collides with another collection's token IDs -- confirmed live this
   exact class of bug already happened once before (cross-collection image
   collision, numerically-colliding token_id treated as the wrong
   collection's token) and burned real debugging time then. See
   favoriteKeyFor() in favorites.js. */
const FAVORITES_VIEW_KEY = 'traitview_favorites_only';
const CONNECTED_WALLET_KEY = 'traitview_connected_wallet_v1';
const CONNECTED_WALLET_CACHE_TTL = 10 * 60 * 1000;

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
  RAILWAY_API = entry.apiBase;
  RAILWAY_KEY = entry.apiKey;
  return entry;
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

/* Fills the #collectionSwitcher <select> from the registry, selecting
   whichever collection is currently active. Called once from init(), right
   after activateCollection() runs, so LIVE_SLUG already reflects the real
   current collection by the time this reads it. */
function populateCollectionSwitcher(){
  const sel = document.getElementById('collectionSwitcher');
  if(!sel) return;
  sel.innerHTML = '';
  for(const slug in COLLECTIONS){
    const opt = document.createElement('option');
    opt.value = slug;
    opt.textContent = COLLECTIONS[slug].name;
    if(slug === LIVE_SLUG) opt.selected = true;
    sel.appendChild(opt);
  }
}

/* Called by the switcher's onchange. A full page reload rather than an
   in-place state reset -- this app's dozens of global state variables
   (MANIFEST, CHUNK_CACHE, TRAIT_FREQ, OS_RANK_MAP, and many more across
   appState.js) were never designed to be individually cleared and
   re-populated mid-session, and init() already correctly bootstraps a
   fresh collection from a cold page load (that's exactly what
   collectionSlugFromUrl() + activateCollection() at the top of init() are
   for). A full reload guarantees genuinely clean state with no risk of one
   collection's leftover data leaking into another's view -- slightly less
   seamless than an instant in-place switch, but far lower-risk, and
   consistent with this codebase's existing classic-script architecture
   rather than retrofitting SPA-style state management onto it. */
function switchCollection(slug){
  window.location.href = `/?collection=${encodeURIComponent(slug)}`;
}

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
