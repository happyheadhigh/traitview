/* TraitView tooltip helpers.
   Classic script on purpose so existing globals and inline handlers keep working. */

/* tooltip + modal */
function tipHtml(id,row){ const kv=keepEntries(row.traits); const traitsHtml=kv.length?kv.map(([k,v])=>`<div><span>${traitDisplayLabel(k)}</span><b>${v}</b></div>`).join(''):'<div style="color:var(--muted)">No traits</div>'; let imgHtml='<div style="color:var(--muted)">No image</div>'; const mapVal=IMAGES_MAP && IMAGES_MAP.get(id); const src=mapVal || row.image || imgForId(id); if(src){ const s=String(src).trim(); if(s.startsWith('<svg')) imgHtml=`<div class="svg-wrap">${s}</div>`; else if(/^data:image\//i.test(s)) imgHtml=`<img src="${s}" alt="#${id}">`; else imgHtml=`<img src="${ipfsToHttp(s)}" alt="#${id}">`; } const obsRank=RARITY_OBS_RANK.get(id); const theoRank=RARITY_THEO_RANK.get(id); const listing=(window.LISTINGS&&window.LISTINGS[id]&&window.LISTINGS[id].opensea)||null; const ethVal = parseEthMaybeWei(listing?listing.price:null); const linkHtml=(listing&&listing.url&&ethVal!=null)?`<a class="linkpill" href="${listing.url}" target="_blank" rel="noopener">OpenSea (${formatEth(ethVal)})</a>`:''; const rankHtml=`${obsRank?`<span class="chip">Obs ${rankDiamondHtml(obsRank)}</span>`:''} ${theoRank?`<span class="chip">Theo ${rankDiamondHtml(theoRank)}</span>`:''}`; return `<div class="tip-title">#${id} • Traits: ${getTraitCount(row)} ${rankHtml}</div>${linkHtml?`<div style="margin:6px 0">${linkHtml}</div>`:''}<div class="tip-body"><div class="tip-img">${imgHtml}</div><div class="traits">${traitsHtml}</div></div>`; }
function attachPreviewHandlers(){
  const tip=$('#tooltip');
  if(!tip) return;
  function pos(mx,my){
    tip.style.visibility='hidden'; tip.style.display='block';
    requestAnimationFrame(()=>tip.classList.add('show'));
    const r=tip.getBoundingClientRect();
    let top=my-r.height-16; if(top<8) top=my+16;
    let left=mx-r.width/2; if(left<8) left=8;
    if(left+r.width>innerWidth-8) left=innerWidth-r.width-8;
    tip.style.top=top+'px'; tip.style.left=left+'px'; tip.style.visibility='visible';
  }
  function hideTip(){ tip.classList.remove('show'); tip.style.display='none'; }

  const isTouchDevice = () => window.matchMedia('(hover: none)').matches || window.innerWidth <= 900;
  if(window.__tvHoverInstalled){
    if(isTouchDevice()) hideTip();
    return;
  }
  window.__tvHoverInstalled = true;
  const hoverState = { id:null, seq:0 };
  document.addEventListener('pointermove', async (e)=>{
    if(isTouchDevice()){ hideTip(); return; }
    const modal = document.getElementById('modal');
    if(modal && modal.style.display !== 'none' && modal.contains(e.target)){ hideTip(); return; }
    const box = e.target.closest('#tokenGrid [data-id], #salesGrid [data-id], #mispricedGrid [data-id]');
    if(!box){ hoverState.id = null; hideTip(); return; }
    const id = +box.dataset.id;
    if(!id){ hideTip(); return; }
    if(id !== hoverState.id){
      hoverState.id = id;
      const seq = ++hoverState.seq;
      try{
        const row = (typeof ROW_CACHE !== 'undefined' && ROW_CACHE.get(id)) || await fetchRow(id);
        if(seq !== hoverState.seq || hoverState.id !== id) return;
        tip.innerHTML = tipHtml(id,row);
      }catch(err){
        if(seq !== hoverState.seq) return;
        tip.innerHTML = `<div class="tip-title">#${id}</div><div style="color:var(--muted);font-size:12px">Preview unavailable</div>`;
      }
    }
    if(tip.innerHTML) pos(e.clientX,e.clientY);
  }, { passive:true });
  document.addEventListener('pointerleave', hideTip);
  window._reattachHovers=()=>{ if(isTouchDevice()) hideTip(); };
}
