/* TraitView image map loading.
   Loaded before app.js.
   Keep this as a classic script, not an ES module. */

let IMAGES_MAP=null;
const RAW_SVG_DOWNLOAD_CACHE = new Map();
function _rememberRawSvgForDownload(id, src){
  try{
    const svg = (typeof _svgTextFromAny === 'function') ? _svgTextFromAny(src) : (String(src||'').trim().startsWith('<svg') ? String(src).trim() : null);
    if(svg) RAW_SVG_DOWNLOAD_CACHE.set(Number(id), svg);
  }catch(_){ }
}

async function loadImagesMap(){
  IMAGES_MAP = new Map();
  try{
    // First, try manifest-based chunk loading
    const mr = await fetch(IMAGES_MANIFEST_URL);
    if (mr.ok){
      const man = await mr.json();
      let chunks = Array.isArray(man) ? man : (man.chunks || []);
      // If we have start/end, we can sort; otherwise keep order
      chunks = chunks.slice();
      try{ chunks.sort((a,b)=> (+a.startId||0) - (+b.startId||0)); }catch{}
      // Fetch all image chunks in parallel instead of serially
      const chunkResults = await Promise.all(chunks.map(async c => {
        const file = (c && (c.file||c.path)) ? String(c.file||c.path) : null;
        if (!file) return null;
        try {
          const r = await fetch(`${DATA_DIR}/${file}`);
          if (!r.ok) return null;
          return r.json();
        } catch(e) { return null; }
      }));
      for (const obj of chunkResults){
        if (!obj) continue;
        for (const [k,v] of Object.entries(obj||{})){
          const nid = Number(k);
          if (!Number.isFinite(nid)) continue;
          let s = (typeof v==='string') ? v.trim() : (v?.image_url||v?.image||v?.image_data||v?.svg||v?.data||v?.url||v?.uri||'').toString().trim();
          if (!s) continue;
          if (s.startsWith('<svg') || /^data:image\//i.test(s)) {
            if(s.startsWith('<svg') || /^data:image\/svg/i.test(s)) _rememberRawSvgForDownload(nid, s);
            IMAGES_MAP.set(nid, s);
          }
          else IMAGES_MAP.set(nid, ipfsToHttp(s));
        }
      }
      return;
    }
    // Fallback: single big JSON (legacy)
    const r=await fetch(IMAGES_URL);
    if(r.ok){
      const raw=await r.json();
      const push=(id,val)=>{ const nid=Number(id); if(!Number.isFinite(nid)||!val) return; let s=String(val).trim();
        if(s.startsWith('<svg')){ _rememberRawSvgForDownload(nid,s); return IMAGES_MAP.set(nid,s); }
        if(/^data:image\//i.test(s)){ if(/^data:image\/svg/i.test(s)) _rememberRawSvgForDownload(nid,s); return IMAGES_MAP.set(nid,s); }
        IMAGES_MAP.set(nid, ipfsToHttp(s));
      };
      if(Array.isArray(raw)){ for(const it of raw){ push(it.token_id??it.id??it.tokenId, it.image_url??it.image??it.image_data??it.svg??it.data??it.url??it.uri); } }
      else if(raw&&typeof raw==='object'){ for(const [k,v] of Object.entries(raw)){ if(v&&typeof v==='object'){ push(k, v.image_url??v.image??v.image_data??v.svg??v.data??v.url??v.uri);} else push(k,v); } }
    }
  }catch(e){
    console.warn('images map load error', e);
  }
}