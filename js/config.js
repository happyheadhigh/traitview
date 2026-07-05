/* TraitView config/constants.
   Loaded before app.js.
   Keep this as a classic script, not an ES module. */

/* live settings */
const LIVE_ENDPOINT = 'https://nft-live-listings.jvweb3.workers.dev';
const LIVE_SLUG = 'on-chain-all-stars';
const LIVE_CONTRACT = '0x078be86f3104a32313a47815792230a3808642cc';

const FAVORITES_KEY = 'traitview_favorites_ocas';
const FAVORITES_VIEW_KEY = 'traitview_favorites_only';
const CONNECTED_WALLET_KEY = 'traitview_connected_wallet_v1';
const CONNECTED_WALLET_CACHE_TTL = 10 * 60 * 1000;