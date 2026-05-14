const STYLE_ID = 'tv-enhanced-render-styles';
const MODAL_CLASS_PREFIX = 'tv-enhanced-';

function injectStyles(){
  if(document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#modal.${MODAL_CLASS_PREFIX}active .box{
  position:relative;
  overflow:auto;
  isolation:isolate;
  border-color:rgba(255,255,255,.18);
  box-shadow:0 22px 70px rgba(0,0,0,.72),0 0 46px rgba(124,77,255,.12);
}
#modal.${MODAL_CLASS_PREFIX}active .box::before{
  content:"";
  position:absolute;
  inset:-2px;
  pointer-events:none;
  border-radius:18px;
  background:
    radial-gradient(circle at 14% 12%,rgba(45,212,191,.16),transparent 28%),
    radial-gradient(circle at 88% 8%,rgba(192,132,252,.14),transparent 30%),
    linear-gradient(120deg,transparent 0%,rgba(255,255,255,.08) 46%,transparent 58%);
  opacity:.7;
  mix-blend-mode:screen;
  z-index:0;
}
#modal.${MODAL_CLASS_PREFIX}active .box > *{position:relative;z-index:1}
#modal.${MODAL_CLASS_PREFIX}active .mhead,
#modal.${MODAL_CLASS_PREFIX}active .modal-actions,
#modal.${MODAL_CLASS_PREFIX}active .modal-action-icons,
#modal.${MODAL_CLASS_PREFIX}active #mDownloadWrap{
  position:relative;
  z-index:30;
}
#modal.${MODAL_CLASS_PREFIX}active #mDownloadMenu{
  z-index:100000;
  pointer-events:auto;
  opacity:1;
  background:rgba(17,28,42,.98);
  backdrop-filter:blur(14px);
  -webkit-backdrop-filter:blur(14px);
}
#modal.${MODAL_CLASS_PREFIX}active #mDownloadMenu button,
#modal.${MODAL_CLASS_PREFIX}active #mDownloadBtn,
#modal.${MODAL_CLASS_PREFIX}active #mFavoriteBtn,
#modal.${MODAL_CLASS_PREFIX}active #mLinks a{
  pointer-events:auto;
  opacity:1;
}
#modal.${MODAL_CLASS_PREFIX}rank-gold .box{
  border-color:rgba(255,215,0,.34);
  box-shadow:0 22px 70px rgba(0,0,0,.72),0 0 58px rgba(255,199,44,.2);
}
#modal.${MODAL_CLASS_PREFIX}rank-purple .box{
  border-color:rgba(192,132,252,.28);
  box-shadow:0 22px 70px rgba(0,0,0,.72),0 0 52px rgba(168,85,247,.18);
}
#modal.${MODAL_CLASS_PREFIX}active #mImg{
  position:relative;
  isolation:isolate;
  overflow:hidden;
  background:
    radial-gradient(circle at 50% 48%,rgba(45,212,191,.18),transparent 52%),
    radial-gradient(circle at 52% 56%,rgba(124,77,255,.12),transparent 66%),
    var(--soft);
  border-color:rgba(255,255,255,.24);
  box-shadow:inset 0 0 42px rgba(255,255,255,.07),0 0 40px rgba(45,212,191,.18),0 0 80px rgba(124,77,255,.10);
}
#modal.${MODAL_CLASS_PREFIX}active #mImg .tv-enhanced-layer{
  position:absolute;
  inset:0;
  pointer-events:none;
  border-radius:inherit;
}
#modal.${MODAL_CLASS_PREFIX}active #mImg .tv-enhanced-token-aura{
  z-index:1;
  background:
    radial-gradient(circle at 50% 44%,rgba(45,212,191,.20),transparent 38%),
    radial-gradient(circle at 50% 68%,rgba(124,77,255,.14),transparent 54%);
  mix-blend-mode:screen;
  opacity:.92;
}
#modal.${MODAL_CLASS_PREFIX}active #mImg .tv-enhanced-eye-glow{
  z-index:5;
  background:
    radial-gradient(circle at 45% 39%,rgba(255,60,60,.58) 0 2.5%,rgba(255,38,38,.32) 4.5%,transparent 10%),
    radial-gradient(circle at 55% 39%,rgba(255,60,60,.58) 0 2.5%,rgba(255,38,38,.32) 4.5%,transparent 10%);
  filter:blur(.2px);
  mix-blend-mode:screen;
  opacity:0;
}
#modal.${MODAL_CLASS_PREFIX}active #mImg .tv-enhanced-shimmer{
  z-index:6;
  background:linear-gradient(112deg,transparent 18%,rgba(255,215,128,.08) 40%,rgba(255,255,255,.26) 49%,rgba(255,215,128,.10) 58%,transparent 70%);
  transform:translateX(-135%);
  opacity:0;
}
#modal.${MODAL_CLASS_PREFIX}active #mImg > img,
#modal.${MODAL_CLASS_PREFIX}active #mImg > .svg-wrap{
  position:relative;
  z-index:2;
  filter:drop-shadow(0 0 14px rgba(255,255,255,.18)) drop-shadow(0 0 22px rgba(45,212,191,.16)) saturate(1.06);
}
#modal.${MODAL_CLASS_PREFIX}active #mImg::before,
#modal.${MODAL_CLASS_PREFIX}active #mImg::after{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;
  border-radius:inherit;
}
#modal.${MODAL_CLASS_PREFIX}active #mImg::before{
  background:linear-gradient(112deg,transparent 16%,rgba(255,255,255,.12) 41%,rgba(255,255,255,.26) 49%,transparent 64%);
  transform:translateX(-135%);
  animation:tvEnhancedSweep 7s ease-in-out infinite;
  z-index:4;
}
#modal.${MODAL_CLASS_PREFIX}active #mImg::after{
  background:
    radial-gradient(circle at 50% 50%,rgba(45,212,191,.22),transparent 42%),
    radial-gradient(circle at 50% 72%,rgba(124,77,255,.16),transparent 56%);
  mix-blend-mode:screen;
  opacity:.9;
  z-index:1;
}
#modal.${MODAL_CLASS_PREFIX}trait-eyes #mImg{
  box-shadow:inset 0 0 44px rgba(255,255,255,.08),0 0 44px rgba(45,212,191,.25),0 0 90px rgba(45,212,191,.12);
  animation:tvEnhancedEyePulse 5.8s ease-in-out infinite;
}
#modal.${MODAL_CLASS_PREFIX}trait-eyes #mImg .tv-enhanced-eye-glow{
  opacity:.7;
  animation:tvEnhancedEyeGlow 3.2s ease-in-out infinite;
}
#modal.${MODAL_CLASS_PREFIX}eye-left #mImg .tv-enhanced-eye-glow{
  background:radial-gradient(circle at 45% 39%,rgba(255,64,64,.62) 0 3%,rgba(255,38,38,.34) 5%,transparent 11%);
}
#modal.${MODAL_CLASS_PREFIX}eye-right #mImg .tv-enhanced-eye-glow{
  background:radial-gradient(circle at 55% 39%,rgba(255,64,64,.62) 0 3%,rgba(255,38,38,.34) 5%,transparent 11%);
}
#modal.${MODAL_CLASS_PREFIX}eye-hot #mImg .tv-enhanced-eye-glow{
  opacity:.82;
  filter:blur(.35px) saturate(1.2);
}
#modal.${MODAL_CLASS_PREFIX}trait-eyes #mImg > img,
#modal.${MODAL_CLASS_PREFIX}trait-eyes #mImg > .svg-wrap{
  filter:drop-shadow(0 0 16px rgba(45,212,191,.30)) drop-shadow(0 0 26px rgba(255,255,255,.16)) saturate(1.08);
}
#modal.${MODAL_CLASS_PREFIX}trait-metal #mImg::before{
  animation-duration:5.4s;
  background:linear-gradient(112deg,transparent 16%,rgba(255,215,128,.14) 38%,rgba(255,255,255,.32) 49%,rgba(255,215,128,.12) 58%,transparent 70%);
}
#modal.${MODAL_CLASS_PREFIX}trait-metal #mImg .tv-enhanced-shimmer{
  opacity:.9;
  animation:tvEnhancedSweep 5.4s ease-in-out infinite;
}
#modal.${MODAL_CLASS_PREFIX}trait-metal #mImg > img,
#modal.${MODAL_CLASS_PREFIX}trait-metal #mImg > .svg-wrap{
  filter:drop-shadow(0 0 16px rgba(255,215,128,.26)) drop-shadow(0 0 24px rgba(255,255,255,.14)) saturate(1.08);
}
#modal.${MODAL_CLASS_PREFIX}trait-haze .box::before{
  opacity:.88;
  background:
    radial-gradient(circle at 18% 24%,rgba(45,212,191,.18),transparent 30%),
    radial-gradient(circle at 84% 18%,rgba(124,77,255,.16),transparent 32%),
    radial-gradient(circle at 50% 100%,rgba(25,195,125,.10),transparent 38%);
}
#modal.${MODAL_CLASS_PREFIX}trait-haze #mImg{
  background:
    radial-gradient(circle at 48% 45%,rgba(25,195,125,.34),transparent 46%),
    radial-gradient(circle at 58% 58%,rgba(124,77,255,.16),transparent 66%),
    var(--soft);
  box-shadow:inset 0 0 48px rgba(25,195,125,.10),0 0 54px rgba(25,195,125,.28),0 0 96px rgba(124,77,255,.12);
}
#modal.${MODAL_CLASS_PREFIX}trait-haze #mImg .tv-enhanced-token-aura{
  background:
    radial-gradient(circle at 50% 46%,rgba(23,255,150,.42),transparent 42%),
    radial-gradient(circle at 50% 70%,rgba(25,195,125,.28),transparent 58%);
  opacity:1;
}
#modal.${MODAL_CLASS_PREFIX}rank-gold #mImg{
  border-color:rgba(255,215,0,.36);
  box-shadow:inset 0 0 46px rgba(255,255,255,.08),0 0 48px rgba(255,215,0,.28),0 0 96px rgba(255,199,44,.14);
}
#modal.${MODAL_CLASS_PREFIX}rank-purple #mImg{
  border-color:rgba(192,132,252,.34);
  box-shadow:inset 0 0 44px rgba(255,255,255,.07),0 0 46px rgba(192,132,252,.24),0 0 90px rgba(124,77,255,.14);
}
@keyframes tvEnhancedSweep{
  0%,64%{transform:translateX(-135%)}
  82%,100%{transform:translateX(135%)}
}
@keyframes tvEnhancedEyePulse{
  0%,100%{filter:saturate(1);box-shadow:inset 0 0 40px rgba(255,255,255,.06),0 0 36px rgba(45,212,191,.16),0 0 72px rgba(45,212,191,.08)}
  50%{filter:saturate(1.08);box-shadow:inset 0 0 48px rgba(255,255,255,.08),0 0 48px rgba(45,212,191,.26),0 0 96px rgba(45,212,191,.12)}
}
@keyframes tvEnhancedEyeGlow{
  0%,100%{opacity:.44;transform:scale(.98)}
  50%{opacity:.86;transform:scale(1.04)}
}
@media (prefers-reduced-motion:reduce){
  #modal.${MODAL_CLASS_PREFIX}active #mImg,
  #modal.${MODAL_CLASS_PREFIX}active #mImg::before,
  #modal.${MODAL_CLASS_PREFIX}active #mImg .tv-enhanced-eye-glow,
  #modal.${MODAL_CLASS_PREFIX}active #mImg .tv-enhanced-shimmer{animation:none}
}
@media (max-width:900px){
  #modal.${MODAL_CLASS_PREFIX}active .box::before{opacity:.52}
  #modal.${MODAL_CLASS_PREFIX}active #mImg::before{animation-duration:9s}
}
`;
  document.head.appendChild(style);
}

function normalize(value){
  return String(value || '').toLowerCase();
}

function classesForTraits(traits){
  const entries = Object.entries(traits || {}).map(([k,v]) => [normalize(k), normalize(v)]);
  const classes = [];
  if(entries.some(([k,v]) => k.includes('eye') || v.includes('smokey') || v.includes('blind') || v.includes('possessed') || v.includes('posessed') || v.includes('left') || v.includes('right'))){
    classes.push(`${MODAL_CLASS_PREFIX}trait-eyes`);
  }
  if(entries.some(([k,v]) => k.includes('eye') && v.includes('left'))) classes.push(`${MODAL_CLASS_PREFIX}eye-left`);
  if(entries.some(([k,v]) => k.includes('eye') && v.includes('right'))) classes.push(`${MODAL_CLASS_PREFIX}eye-right`);
  if(entries.some(([k,v]) => k.includes('eye') && /red|laser|glow|smokey|possess|posess|left|right/.test(v))) classes.push(`${MODAL_CLASS_PREFIX}eye-hot`);
  if(entries.some(([k,v]) => k.includes('jewell') || v.includes('gold') || v.includes('diamond') || v.includes('chain') || v.includes('grill') || v.includes('choker') || v.includes('earring') || v.includes('bracelet'))){
    classes.push(`${MODAL_CLASS_PREFIX}trait-metal`);
  }
  if(entries.some(([k,v]) => k === 'type' && /zombie|alien|skeleton|radioactive|demonic/.test(v))){
    classes.push(`${MODAL_CLASS_PREFIX}trait-haze`);
  }
  return classes;
}

function rankClass(rank){
  const n = Number(rank);
  if(!Number.isFinite(n) || n <= 0) return '';
  if(n <= 100) return `${MODAL_CLASS_PREFIX}rank-gold`;
  if(n <= 1000) return `${MODAL_CLASS_PREFIX}rank-purple`;
  return '';
}

export function clearEnhancedRender(modal = document.getElementById('modal')){
  if(!modal) return;
  [...modal.classList].forEach(cls => {
    if(cls.startsWith(MODAL_CLASS_PREFIX)) modal.classList.remove(cls);
  });
  modal.querySelectorAll('.tv-enhanced-layer').forEach(layer => layer.remove());
  modal.removeAttribute('data-enhanced-token-id');
}

function ensureImageLayers(modal){
  const img = modal?.querySelector('#mImg');
  if(!img) return;
  ['token-aura', 'eye-glow', 'shimmer'].forEach(name => {
    if(img.querySelector(`.tv-enhanced-${name}`)) return;
    const layer = document.createElement('span');
    layer.className = `tv-enhanced-layer tv-enhanced-${name}`;
    layer.setAttribute('aria-hidden', 'true');
    img.prepend(layer);
  });
}

export function applyEnhancedRender(payload = {}){
  injectStyles();
  const modal = payload.modal || document.getElementById('modal');
  if(!modal) return;
  clearEnhancedRender(modal);
  ensureImageLayers(modal);
  const classes = [
    `${MODAL_CLASS_PREFIX}active`,
    rankClass(payload.rank),
    ...classesForTraits(payload.row?.traits)
  ].filter(Boolean);
  modal.classList.add(...classes);
  modal.dataset.enhancedTokenId = String(payload.id || '');
}
