/* TraitView favorites helpers.
   Loaded after config.js/state.js and before app.js.
   Keep this as a classic script, not an ES module. */

function getFavorites(){
  try{
    const raw = localStorage.getItem(FAVORITES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set((Array.isArray(arr) ? arr : []).map(v => +v).filter(Boolean));
  }catch(e){ return new Set(); }
}
function saveFavorites(set){
  localStorage.setItem(FAVORITES_KEY, JSON.stringify([...set].sort((a,b)=>a-b)));
  pushFavoritesToWallet(set);
}
// ── Wallet sync ──────────────────────────────────────────────────────────────
// localStorage remains the always-on local cache (works instantly, works with
// no wallet connected at all). When a wallet IS connected, favorites also
// push to the server so they follow the wallet across devices/browsers.
let _favoritesSyncTimer = null;
function pushFavoritesToWallet(set){
  const addr = (typeof CONNECTED_WALLET !== 'undefined' && CONNECTED_WALLET?.address) || null;
  if(!addr || typeof dbFetch !== 'function') return;
  clearTimeout(_favoritesSyncTimer);
  _favoritesSyncTimer = setTimeout(() => {
    const slug = (typeof LIVE_SLUG !== 'undefined' && LIVE_SLUG) || 'on-chain-all-stars';
    fetch(`${RAILWAY_API}/db/wallet/${encodeURIComponent(addr)}/favorites?key=${encodeURIComponent(RAILWAY_KEY)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug, tokenIds: [...set] }),
    }).catch(()=>{});
  }, 400); // debounce — avoid a network call per click if favoriting several tokens quickly
}
// Called once when a wallet connects — merges server-side favorites (from any
// other device/browser) into the local set, rather than overwriting either side.
async function syncFavoritesWithWallet(addr){
  if(!addr || typeof dbFetch !== 'function') return;
  try{
    const slug = (typeof LIVE_SLUG !== 'undefined' && LIVE_SLUG) || 'on-chain-all-stars';
    const data = await dbFetch(`/db/wallet/${encodeURIComponent(addr)}/favorites`, { slug });
    const remote = Array.isArray(data?.tokenIds) ? data.tokenIds.map(Number).filter(Boolean) : [];
    const local = getFavorites();
    const merged = new Set([...local, ...remote]);
    if(merged.size !== local.size || remote.some(id => !local.has(id))){
      localStorage.setItem(FAVORITES_KEY, JSON.stringify([...merged].sort((a,b)=>a-b)));
      syncFavoritesUI();
      if(typeof renderTokenGridFromState === 'function' && favoritesOnlyEnabled()) renderTokenGridFromState();
    }
    // Push the merged result back so both sides agree (handles first-time
    // connect where local had favorites the server didn't know about yet).
    pushFavoritesToWallet(merged);
  }catch(_){}
}
function isFavorite(id){
  return getFavorites().has(+id);
}
function favoriteCount(){
  return getFavorites().size;
}
function favoritesOnlyEnabled(){
  return localStorage.getItem(FAVORITES_VIEW_KEY) === '1';
}
function setFavoritesOnly(on){
  localStorage.setItem(FAVORITES_VIEW_KEY, on ? '1' : '0');
  syncFavoritesUI();
}
function toggleFavorite(id){
  const favs = getFavorites();
  id = +id;
  if(favs.has(id)) favs.delete(id); else favs.add(id);
  saveFavorites(favs);
  syncFavoritesUI();
  syncFavoriteButtons(id);
}
function toggleFavoritesView(){
  setFavoritesOnly(!favoritesOnlyEnabled());
  if(typeof renderTokenGridFromState === 'function') renderTokenGridFromState();
}
function syncFavoriteButtons(id){
  document.querySelectorAll('[data-fav-id]').forEach(btn => {
    const btnId = +btn.getAttribute('data-fav-id');
    if(id != null && btnId !== +id) return;
    const active = isFavorite(btnId);
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.setAttribute('title', active ? 'Remove favorite' : 'Add favorite');
  });
}
function syncFavoritesUI(){
  const count = favoriteCount();
  const favMode = favoritesOnlyEnabled();
  const dc = document.getElementById('desktopFavoritesCount');
  const mc = document.getElementById('mobileFavoritesCount');
  if(dc) dc.textContent = count;
  if(mc) mc.textContent = count;
  const db = document.getElementById('desktopFavoritesBtn');
  const mb = document.getElementById('mobileFavoritesToggle');
  if(db) db.classList.toggle('active', favMode);
  if(mb) mb.classList.toggle('active', favMode);
  if(mb){
    const arrow = mb.querySelector('.mobile-menu-arrow');
    if(arrow) arrow.textContent = favMode ? 'on' : 'view';
  }
}
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-fav-id]');
  if(!btn) return;
  e.preventDefault();
  e.stopPropagation();
  toggleFavorite(+btn.getAttribute('data-fav-id'));
});
window.addEventListener('storage', syncFavoritesUI);
setTimeout(syncFavoritesUI, 0);