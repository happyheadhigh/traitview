/* TraitView image map loading.
   Loaded before app.js.
   Keep this as a classic script, not an ES module. */

let IMAGES_MAP=null;
const RAW_SVG_DOWNLOAD_CACHE = new Map();
// jv: "Why do svg token images look like this in screenshots? Even
// when I use the grid download they look like this." Traced this
// specific cache down as the real reason the crisp-edges fix (added to
// _svgTextFromAny, in js/downloads.js) wasn't taking effect for
// downloads: this function is the single choke point that populates
// RAW_SVG_DOWNLOAD_CACHE, and _getRawSvgForDownload checks this cache
// FIRST, before anything else -- but downloads.js is lazy-loaded on
// demand (js/downloadLoader.js), while this file loads eagerly and
// populates this cache during ordinary browsing, well before a
// download is ever triggered. So _svgTextFromAny was reliably still
// undefined here, falling through to the plain, un-crisped extraction
// below -- and once a stale, un-crisped value is cached, it's what
// every later download gets, even after downloads.js finishes loading.
// _svgCrisp itself (unlike the fuller _svgTextFromAny) is duplicated in
// js/app.js specifically because that file is never lazy -- it's
// guaranteed loaded by the time this actually runs (loadImagesMap()
// below is only ever called from app.js's own init sequence, which
// necessarily means app.js's top-level code, including that function
// declaration, already ran) -- so preferring it here over
// _svgTextFromAny guarantees this cache is correct regardless of
// whether downloads.js has loaded yet.
function _rememberRawSvgForDownload(id, src){
  try{
    let svg = null;
    const s = String(src || '').trim();
    if(s.startsWith('<svg')) svg = s;
    else if(/^data:image\/svg/i.test(s)){
      const comma = s.indexOf(',');
      if(comma >= 0){
        const meta = s.slice(5, comma).toLowerCase();
        const body = s.slice(comma + 1);
        try{ svg = meta.includes('base64') ? atob(body) : decodeURIComponent(body); }catch(_){ svg = null; }
      }
    }
    if(svg && typeof _svgCrisp === 'function') svg = _svgCrisp(svg);
    if(svg) RAW_SVG_DOWNLOAD_CACHE.set(Number(id), svg);
  }catch(_){ }
}

// jv: "the ocas images in the grid still don't load fully and quick like
// argonauts... OCAS are svg images as well." This used to download all five
// token_images_*.json files (55 MB of base64 SVG) before the grid could
// render. Each token now has its own small static file (data/img/<id>.svg,
// ~4 KB, generated from those chunks), and the map just holds those short
// URLs -- filled instantly from a tiny index; images load per tile, cached
// by the browser/CDN. Every reader already handles a plain image URL. The
// old full loader is kept below (unused) as _loadImagesMapFull.
async function loadImagesMap(){
  if(typeof LIVE_SLUG !== 'undefined' && LIVE_SLUG !== 'on-chain-all-stars') return;
  if(IMAGES_MAP && IMAGES_MAP.size >= 1000) return;   // already filled
  IMAGES_MAP = IMAGES_MAP || new Map();
  let ix = { min: 1, max: 10000 };
  try{ const r = await fetch(`${DATA_DIR}/img/index.json`); if(r.ok) ix = await r.json(); }catch(_){}
  for(let id = ix.min; id <= ix.max; id++) if(!IMAGES_MAP.has(id)) IMAGES_MAP.set(id, `${DATA_DIR}/img/${id}.svg`);
}
async function _loadImagesMapFull(){
  // jv: "how many times do I have to bring this up" -- rightly frustrated.
  // My earlier fix to _getRawSvgForDownload was correct for its own
  // internal fallback logic, but missed this: loadImagesMap() itself has
  // ZERO collection-awareness -- it always reads from OCAS's own static
  // manifest/chunk files, no matter which collection is active, and is
  // called from _getTokenDownloadSource() completely ungated (no LIVE_SLUG
  // check at that call site at all). So it silently populated BOTH
  // IMAGES_MAP and RAW_SVG_DOWNLOAD_CACHE with OCAS's own data keyed by
  // the same numeric token ID -- and _getRawSvgForDownload's very first
  // step checks that exact cache before anything else runs, completely
  // bypassing my whole fixed fallback chain underneath it. Gating this
  // inside the function itself, not just at its call sites, so no future
  // caller (gated or not) can ever repoison either cache with wrong data
  // for another collection again.
  if(typeof LIVE_SLUG !== 'undefined' && LIVE_SLUG !== 'on-chain-all-stars') return;
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