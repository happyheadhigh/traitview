/* TraitView main app runtime state.
   Loaded before rankSort.js, walletAnalytics.js, mispriced.js, and app.js.
   Keep this as a classic script, not an ES module. */

window.LISTINGS = {};
let LIVE_OK = false;

/* caches + state */
let MANIFEST = null, CHUNK_SIZE = 1000, CHUNKS_DIR = 'traits_chunks', TOKEN_COUNT = 0;
const CHUNK_CACHE = new Map(), ROW_CACHE = new Map();

let TRAIT_FREQ = {}, TRAIT_DOMAIN = {}, MAX_TRAIT_COUNT = 0;
let currentTraitCount = null, activeTraits = new Map(), AVAILABLE_DOMAIN = null;

let RARITY_OBS_RANK = new Map(), RARITY_THEO_RANK = new Map(), RARITY_MODE = 'observed', PROB_DATA = null;
let OS_RANK_MAP = new Map(); // token_id → os_rank from Railway DB
let SURVIVOR_COUNT_MAP = new Map(); // token_id → number of times it has ever survived a burn

let pinnedA = null, pinnedB = null, pinnedSet = [];
const OPEN_GROUPS = new Set();

let CHART_ID_MAP = {};
let rankMin = null, rankMax = null;

const LAST_SALE_CACHE = new Map();
const LAST_SALE_PENDING = new Set();