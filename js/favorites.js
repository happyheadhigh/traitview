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