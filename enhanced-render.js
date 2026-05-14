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
  border-color:rgba(255,255,255,.16);
  box-shadow:inset 0 0 34px rgba(255,255,255,.04),0 0 28px rgba(45,212,191,.08);
}
#modal.${MODAL_CLASS_PREFIX}active #mImg::before,
#modal.${MODAL_CLASS_PREFIX}active #mImg::after{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;
  border-radius:inherit;
  z-index:3;
}
#modal.${MODAL_CLASS_PREFIX}active #mImg::before{
  background:linear-gradient(112deg,transparent 18%,rgba(255,255,255,.10) 42%,rgba(255,255,255,.18) 49%,transparent 62%);
  transform:translateX(-135%);
  animation:tvEnhancedSweep 7s ease-in-out infinite;
}
#modal.${MODAL_CLASS_PREFIX}active #mImg::after{
  background:radial-gradient(circle at 50% 18%,rgba(255,255,255,.08),transparent 36%);
  mix-blend-mode:screen;
  opacity:.72;
}
#modal.${MODAL_CLASS_PREFIX}trait-eyes #mImg{
  box-shadow:inset 0 0 36px rgba(255,255,255,.05),0 0 30px rgba(45,212,191,.13);
  animation:tvEnhancedEyePulse 5.8s ease-in-out infinite;
}
#modal.${MODAL_CLASS_PREFIX}trait-metal #mImg::before{
  animation-duration:5.4s;
  background:linear-gradient(112deg,transparent 18%,rgba(255,215,128,.08) 38%,rgba(255,255,255,.22) 49%,rgba(255,215,128,.08) 57%,transparent 68%);
}
#modal.${MODAL_CLASS_PREFIX}trait-haze .box::before{
  opacity:.88;
  background:
    radial-gradient(circle at 18% 24%,rgba(45,212,191,.18),transparent 30%),
    radial-gradient(circle at 84% 18%,rgba(124,77,255,.16),transparent 32%),
    radial-gradient(circle at 50% 100%,rgba(25,195,125,.10),transparent 38%);
}
#modal.${MODAL_CLASS_PREFIX}rank-gold #mImg{
  box-shadow:inset 0 0 36px rgba(255,255,255,.05),0 0 34px rgba(255,215,0,.18);
}
#modal.${MODAL_CLASS_PREFIX}rank-purple #mImg{
  box-shadow:inset 0 0 36px rgba(255,255,255,.05),0 0 34px rgba(192,132,252,.16);
}
@keyframes tvEnhancedSweep{
  0%,64%{transform:translateX(-135%)}
  82%,100%{transform:translateX(135%)}
}
@keyframes tvEnhancedEyePulse{
  0%,100%{filter:saturate(1);box-shadow:inset 0 0 36px rgba(255,255,255,.05),0 0 26px rgba(45,212,191,.10)}
  50%{filter:saturate(1.06);box-shadow:inset 0 0 40px rgba(255,255,255,.06),0 0 34px rgba(45,212,191,.18)}
}
@media (prefers-reduced-motion:reduce){
  #modal.${MODAL_CLASS_PREFIX}active #mImg,
  #modal.${MODAL_CLASS_PREFIX}active #mImg::before{animation:none}
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
  if(entries.some(([k,v]) => k.includes('eye') || v.includes('smokey') || v.includes('blind') || v.includes('possessed') || v.includes('posessed'))){
    classes.push(`${MODAL_CLASS_PREFIX}trait-eyes`);
  }
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
  modal.removeAttribute('data-enhanced-token-id');
}

export function applyEnhancedRender(payload = {}){
  injectStyles();
  const modal = payload.modal || document.getElementById('modal');
  if(!modal) return;
  clearEnhancedRender(modal);
  const classes = [
    `${MODAL_CLASS_PREFIX}active`,
    rankClass(payload.rank),
    ...classesForTraits(payload.row?.traits)
  ].filter(Boolean);
  modal.classList.add(...classes);
  modal.dataset.enhancedTokenId = String(payload.id || '');
}
