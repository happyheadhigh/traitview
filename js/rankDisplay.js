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