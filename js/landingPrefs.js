/* TraitView landing page — local preference layer.
   Persists a visitor's personal collection ordering, hidden collections,
   and (future-ready) favorites in localStorage. Entirely separate from
   the database, which remains the sole source of truth for WHICH
   collections exist -- this only ever affects presentation/order for
   the person viewing it, never touches the DB, never requires an
   account.
   Classic script, no dependencies on anything else in the app -- can be
   loaded standalone. */

const LANDING_PREFS_KEY = 'traitview_landing_prefs_v1';

function _loadLandingPrefs(){
  try{
    const raw = localStorage.getItem(LANDING_PREFS_KEY);
    const data = raw ? JSON.parse(raw) : null;
    return {
      order: Array.isArray(data?.order) ? data.order : [],
      hidden: Array.isArray(data?.hidden) ? data.hidden : [],
      favorites: Array.isArray(data?.favorites) ? data.favorites : [],
    };
  }catch(_){
    return { order: [], hidden: [], favorites: [] };
  }
}

function _saveLandingPrefs(prefs){
  try{ localStorage.setItem(LANDING_PREFS_KEY, JSON.stringify(prefs)); }catch(_){}
}

// Merges the DB's real collection list (source of truth for WHICH
// collections exist) with the saved local order/hidden/favorites state.
// A saved slug that no longer exists in the DB is silently dropped --
// never breaks on stale local state. A new DB collection not yet in the
// saved order gets appended at the end, so an existing custom layout is
// never destroyed by a newly-onboarded collection arriving.
function mergeLandingCollections(dbSlugs){
  const prefs = _loadLandingPrefs();
  const dbSet = new Set(dbSlugs);
  const ordered = prefs.order.filter(slug => dbSet.has(slug));
  for(const slug of dbSlugs){
    if(!ordered.includes(slug)) ordered.push(slug);
  }
  const hidden = new Set(prefs.hidden.filter(slug => dbSet.has(slug)));
  const favorites = new Set(prefs.favorites.filter(slug => dbSet.has(slug)));
  return { ordered, hidden, favorites };
}

function setLandingOrder(orderedSlugs){
  const prefs = _loadLandingPrefs();
  prefs.order = orderedSlugs.slice();
  _saveLandingPrefs(prefs);
}

function hideLandingCollection(slug){
  const prefs = _loadLandingPrefs();
  if(!prefs.hidden.includes(slug)) prefs.hidden.push(slug);
  _saveLandingPrefs(prefs);
}

function unhideLandingCollection(slug){
  const prefs = _loadLandingPrefs();
  prefs.hidden = prefs.hidden.filter(s => s !== slug);
  _saveLandingPrefs(prefs);
}

// Moves a slug to the front of a given order (used by the card's "•••"
// menu's "Move to top") and persists the result. Returns the new order
// so the caller can re-render without a second read.
function moveLandingCollectionToTop(slug, currentOrder){
  const newOrder = [slug, ...currentOrder.filter(s => s !== slug)];
  setLandingOrder(newOrder);
  return newOrder;
}

function toggleLandingFavorite(slug){
  const prefs = _loadLandingPrefs();
  const idx = prefs.favorites.indexOf(slug);
  if(idx === -1) prefs.favorites.push(slug); else prefs.favorites.splice(idx, 1);
  _saveLandingPrefs(prefs);
  return prefs.favorites.includes(slug);
}

function isLandingFavorite(slug){
  return _loadLandingPrefs().favorites.includes(slug);
}

// "Reset layout" -- restores the default database-driven order and
// unhides everything. Does not touch favorites (a separate, additive
// preference the spec treats independently of layout).
function resetLandingLayout(){
  const prefs = _loadLandingPrefs();
  prefs.order = [];
  prefs.hidden = [];
  _saveLandingPrefs(prefs);
}
