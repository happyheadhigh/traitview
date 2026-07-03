/* TraitView rank display helpers.
   Loaded before app.js.
   Keep this as a classic script, not an ES module. */

function rankDiamondHtml(rank, extraStyle, system){
  if(!rank) return '';
  const color = rankColor(rank);
  const s = extraStyle || '';
  const sys = system || getRankSystem();
  // OS rank uses ◆ diamond; TV rank uses ▲ triangle
  const sym = sys === 'tv'
    ? `<span style="font-size:0.8em;margin-right:1px;line-height:1">▲</span>`
    : `<svg width="9" height="9" viewBox="0 0 24 24" fill="${color}" style="display:inline-block;vertical-align:middle;margin-right:1px;flex-shrink:0" xmlns="http://www.w3.org/2000/svg"><path d="M12 2 C12 2 13.5 9 20 10 C20 10 13.5 11 12 22 C12 22 10.5 11 4 10 C4 10 10.5 9 12 2Z"/></svg>`;
  return `<span style="color:${color};display:inline-flex;align-items:center;${s}">${sym}${rank}</span>`;
}

// Canonical single-rank lookup: real OpenSea rank by default (diamond), only
// falling back to TraitView's own computed rank (RARITY_OBS_RANK) when OS
// doesn't have an entry for this token yet -- and when it does fall back, it
// correctly returns system:'tv' so the caller renders a triangle, not a
// diamond. This exists because many call sites were doing
// `RARITY_OBS_RANK.get(id)` directly and passing it to rankDiamondHtml()
// with no system specified, which defaults to a diamond regardless of
// source -- visually claiming a TraitView-computed number is OpenSea's real
// published rank.
function displayRankFor(id){
  const osVal = (typeof OS_RANK_MAP !== 'undefined' && OS_RANK_MAP) ? OS_RANK_MAP.get(+id) : null;
  if(osVal) return { value: osVal, system: 'os' };
  const tvVal = (typeof RARITY_OBS_RANK !== 'undefined' && RARITY_OBS_RANK) ? RARITY_OBS_RANK.get(+id) : null;
  if(tvVal) return { value: tvVal, system: 'tv' };
  return { value: null, system: 'os' };
}
function displayRankHtml(id, extraStyle){
  const { value, system } = displayRankFor(id);
  return value ? rankDiamondHtml(value, extraStyle, system) : '';
}