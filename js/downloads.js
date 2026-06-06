/* TraitView download helpers.
   Classic script on purpose so existing globals and inline handlers keep working. */

function _downloadBtnIcon(label){
  return '<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v8M5 7l3 3 3-3M2 12h12"/></svg><span>' + label + '</span>';
}

function _setDownloadBtnState(btn, label, disabled){
  if(!btn) return;
  btn.innerHTML = _downloadBtnIcon(label);
  btn.disabled = !!disabled;
  btn.style.opacity = disabled ? '.75' : '1';
}


function _svgTextFromAny(src){
  const s = String(src || '').trim();
  if(!s) return null;
  if(s.startsWith('<svg') || s.startsWith('<?xml')) return s;
  if(s.startsWith('data:image/svg')){
    const comma = s.indexOf(',');
    if(comma < 0) return null;
    const meta = s.slice(5, comma).toLowerCase();
    const body = s.slice(comma + 1);
    try{ return meta.includes('base64') ? atob(body) : decodeURIComponent(body); }catch(_){ return null; }
  }
  return null;
}

// Backward-compatible name used by older code paths.
function _decodeSvgText(src){ return _svgTextFromAny(src); }

function _extractEmbeddedRasterFromSvg(svgText){
  const s = String(svgText || '');
  const patterns = [
    /<(?:image|img)\b[^>]*(?:href|src)=["'](data:image\/(?:png|jpeg|jpg|webp);base64,[^"']+)["']/i,
    /(?:href|src)=["'](data:image\/(?:png|jpeg|jpg|webp);base64,[^"']+)["']/i
  ];
  for(const re of patterns){
    const m = s.match(re);
    if(m && m[1]) return m[1];
  }
  return null;
}

function _extractSvgBackgroundFill(svgText){
  const s = String(svgText || '');
  const badFill = v => {
    v = String(v || '').trim().toLowerCase();
    return !v || v === 'none' || v === 'transparent' || v === 'currentcolor' || /^url\(/i.test(v);
  };
  const isBlack = v => {
    v = String(v || '').trim().toLowerCase().replace(/\s+/g,'');
    return v === '#000' || v === '#000000' || v === 'black' || v === 'rgb(0,0,0)' || v === 'rgba(0,0,0,1)';
  };

  try{
    const doc = new DOMParser().parseFromString(s, 'image/svg+xml');
    const svg = doc.documentElement;
    if(!svg || String(svg.nodeName).toLowerCase() === 'parsererror') throw new Error('bad svg');

    // Build a tiny CSS fill resolver for OCAS SVGs that use classes instead of fill="...".
    const cssFill = new Map();
    [...doc.querySelectorAll('style')].forEach(st => {
      const css = st.textContent || '';
      css.replace(/([.#][\w-]+)\s*\{[^}]*?fill\s*:\s*([^;!}]+)[^}]*\}/gi, (_, sel, fill) => {
        cssFill.set(sel.trim(), fill.trim());
      });
    });

    const getFill = el => {
      let fill = (el.getAttribute('fill') || '').trim();
      if(badFill(fill)){
        const style = el.getAttribute('style') || '';
        const m = style.match(/(?:^|;)\s*fill\s*:\s*([^;]+)/i);
        if(m) fill = m[1].trim();
      }
      if(badFill(fill)){
        const id = el.getAttribute('id');
        if(id && cssFill.has('#'+id)) fill = cssFill.get('#'+id);
      }
      if(badFill(fill)){
        const cls = (el.getAttribute('class') || '').split(/\s+/).filter(Boolean);
        for(const c of cls){ if(cssFill.has('.'+c)){ fill = cssFill.get('.'+c); break; } }
      }
      return badFill(fill) ? null : fill;
    };

    const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    const vbW = Number.isFinite(vb[2]) && vb[2] > 0 ? vb[2] : (parseFloat(svg.getAttribute('width')) || 100);
    const vbH = Number.isFinite(vb[3]) && vb[3] > 0 ? vb[3] : (parseFloat(svg.getAttribute('height')) || 100);
    const pctOrNum = (val, total) => {
      val = String(val || '').trim();
      if(val.endsWith('%')) return parseFloat(val) / 100 * total;
      return parseFloat(val);
    };

    const candidates = [];
    const push = (el, fill, score) => { if(fill) candidates.push({ fill, score, el }); };

    // Strong signal: a full-size rect is the background.
    [...doc.querySelectorAll('rect')].forEach((r, idx) => {
      const fill = getFill(r);
      if(!fill) return;
      const x = pctOrNum(r.getAttribute('x') || '0', vbW) || 0;
      const y = pctOrNum(r.getAttribute('y') || '0', vbH) || 0;
      const w = pctOrNum(r.getAttribute('width') || '', vbW);
      const h = pctOrNum(r.getAttribute('height') || '', vbH);
      const full = x <= 1 && y <= 1 && w >= vbW * .90 && h >= vbH * .90;
      push(r, fill, full ? 1000 - idx : 200 - idx);
    });

    // OCAS-style SVG backgrounds are often paths, not rects.
    [...doc.querySelectorAll('path')].forEach((path, idx) => {
      const fill = getFill(path);
      if(!fill) return;
      const d = (path.getAttribute('d') || '').replace(/,/g,' ').replace(/\s+/g,' ').trim().toLowerCase();
      const looksFullBox =
        /^m\s*0\s+0\s*h\s*[-\d.]+\s*v\s*[-\d.]+\s*h\s*[-\d.]+/i.test(d) ||
        /^m\s*0\s+0\s*h\s*[-\d.]+\s*v\s*[-\d.]+\s*h\s*[-\d.]+\s*z?/i.test(d) ||
        /^m\s*0\s+0\s*h\s*100%?/i.test(d) ||
        (/^m\s*0\s+0/i.test(d) && /h\s*0\s*z?$/i.test(d) && /v\s*[-\d.]+/i.test(d));
      push(path, fill, looksFullBox ? 900 - idx : 80 - idx);
    });

    // Fallback: first filled shape before the embedded character image. In these SVGs,
    // the background normally appears before the base64 character layer.
    const firstImage = [...doc.querySelectorAll('image,img')][0];
    const allShapes = [...doc.querySelectorAll('rect,path,polygon,polyline,circle,ellipse')];
    for(let i=0;i<allShapes.length;i++){
      const el = allShapes[i];
      if(firstImage && (el.compareDocumentPosition(firstImage) & Node.DOCUMENT_POSITION_PRECEDING)) continue;
      const fill = getFill(el);
      if(fill) push(el, fill, 20 - i);
    }

    candidates.sort((a,b) => b.score - a.score);
    const nonBlack = candidates.find(c => !isBlack(c.fill));
    if(nonBlack) return nonBlack.fill;
    if(candidates.length) return candidates[0].fill;
  }catch(_){ }

  // Regex fallback for common SVG background forms.
  const regexes = [
    /<rect\b[^>]*(?:width=["'](?:100%|[2-9]\d{2,}|\d{4,})["'][^>]*height=["'](?:100%|[2-9]\d{2,}|\d{4,})["']|height=["'](?:100%|[2-9]\d{2,}|\d{4,})["'][^>]*width=["'](?:100%|[2-9]\d{2,}|\d{4,})["'])[^>]*fill=["']([^"']+)["']/i,
    /<path\b[^>]*d=["']M\s*0[ ,]0[^"']*["'][^>]*fill=["']([^"']+)["']/i,
    /<[^>]+fill=["']([^"']+)["'][^>]*>/i
  ];
  for(const re of regexes){
    const m = s.match(re);
    if(m && !badFill(m[1]) && !isBlack(m[1])) return m[1];
  }
  return null;
}


function _downloadAbsUrl(url, baseUrl){
  let u = String(url || '').trim();
  if(!u) return u;
  if(u.startsWith('ipfs://')) return ipfsToHttp(u);
  if(u.startsWith('//')) return location.protocol + u;
  if(/^https?:|^data:|^blob:/i.test(u)) return u;
  try{ return new URL(u, baseUrl || document.baseURI).href; }catch(_){ return u; }
}

function _blobToDataUrl(blob){
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(new Error('Could not inline SVG image asset.'));
    fr.readAsDataURL(blob);
  });
}

async function _inlineExternalSvgImages(svgText, baseUrl){
  const doc = new DOMParser().parseFromString(String(svgText || ''), 'image/svg+xml');
  const svg = doc.documentElement;
  if(!svg || String(svg.nodeName).toLowerCase() === 'parsererror') return String(svgText || '');

  // Make sure serialized SVG keeps href/xlink refs valid.
  if(!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if(!svg.getAttribute('xmlns:xlink')) svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  const nodes = [...doc.querySelectorAll('image, img')];
  for(const node of nodes){
    let href = node.getAttribute('href') || node.getAttributeNS('http://www.w3.org/1999/xlink', 'href') || node.getAttribute('xlink:href') || node.getAttribute('src') || '';
    href = String(href || '').trim();
    if(!href || href.startsWith('data:') || href.startsWith('blob:')) continue;
    try{
      const assetUrl = _downloadAbsUrl(href, baseUrl);
      const resp = await fetch(assetUrl, { cache:'no-store' });
      if(!resp.ok) continue;
      const dataUrl = await _blobToDataUrl(await resp.blob());
      node.setAttribute('href', dataUrl);
      node.setAttributeNS('http://www.w3.org/1999/xlink', 'href', dataUrl);
      node.removeAttribute('src');
    }catch(err){
      console.warn('Could not inline SVG background asset:', href, err);
    }
  }

  return new XMLSerializer().serializeToString(svg);
}

function _svgWithoutBackgroundGroup(svgText){
  const doc = new DOMParser().parseFromString(String(svgText || ''), 'image/svg+xml');
  const svg = doc.documentElement;
  if(!svg || String(svg.nodeName).toLowerCase() === 'parsererror') return String(svgText || '');
  doc.querySelectorAll('g#Background, [id="Background"]').forEach(bg => bg.remove());
  if(!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if(!svg.getAttribute('xmlns:xlink')) svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  return new XMLSerializer().serializeToString(svg);
}

function _svgBackgroundOnly(svgText){
  const doc = new DOMParser().parseFromString(String(svgText || ''), 'image/svg+xml');
  const svg = doc.documentElement;
  if(!svg || String(svg.nodeName).toLowerCase() === 'parsererror') return null;
  const bgNodes = [...doc.querySelectorAll('g#Background, [id="Background"]')];
  if(!bgNodes.length) return null;

  const outDoc = document.implementation.createDocument('http://www.w3.org/2000/svg', 'svg', null);
  const outSvg = outDoc.documentElement;
  for(const attr of svg.attributes) outSvg.setAttribute(attr.name, attr.value);
  if(!outSvg.getAttribute('xmlns')) outSvg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  if(!outSvg.getAttribute('xmlns:xlink')) outSvg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  [...svg.children].forEach(child => {
    const name = child.localName?.toLowerCase();
    if(name === 'defs' || name === 'style' || name === 'title' || name === 'desc'){
      outSvg.appendChild(outDoc.importNode(child, true));
    }
  });
  bgNodes.forEach(bg => outSvg.appendChild(outDoc.importNode(bg, true)));
  return new XMLSerializer().serializeToString(outSvg);
}

async function _drawFullSvgSafely(svgText, alpha, baseUrl, size = 4096){
  // Render the real SVG, not just the character layer. This is what preserves
  // owner-selected OCAS metadata backgrounds while still avoiding tainted canvas:
  // any external SVG <image> refs are fetched as blobs and inlined as data URLs first.
  const safeSvg = await _inlineExternalSvgImages(svgText, baseUrl);
  if(/<(?:image|img)\b[^>]*(?:href|xlink:href|src)=["'](?!data:|blob:)[^"']+["']/i.test(safeSvg)){
    throw new Error('SVG still contains external image references after inlining.');
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { alpha });
  ctx.imageSmoothingEnabled = false;

  const load = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Safe SVG image failed to load.'));
    img.src = src;
  });

  const blob = new Blob([safeSvg], { type:'image/svg+xml;charset=utf-8' });
  const objUrl = URL.createObjectURL(blob);
  try{
    const img = await load(objUrl);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(img, 0, 0, size, size);
    try{ ctx.getImageData(0, 0, 1, 1); }catch(e){ throw new Error('Canvas was tainted after safe SVG render.'); }
    return canvas;
  }finally{
    URL.revokeObjectURL(objUrl);
  }
}

async function _drawSvgBackgroundAndEmbeddedArt(svgText, alpha, baseUrl, size = 4096){
  const embedded = _extractEmbeddedRasterFromSvg(svgText);
  if(!embedded) throw new Error('No embedded character image found in this token SVG.');
  const bgSvg = _svgBackgroundOnly(svgText);
  if(!bgSvg) throw new Error('No SVG Background group found for With BG export.');

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { alpha });
  ctx.imageSmoothingEnabled = false;

  const load = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Download image layer failed to load.'));
    img.src = src;
  });

  const safeBgSvg = await _inlineExternalSvgImages(bgSvg, baseUrl);
  if(/<(?:image|img)\b[^>]*(?:href|xlink:href|src)=["'](?!data:|blob:)[^"']+["']/i.test(safeBgSvg)){
    throw new Error('SVG Background still contains external image references after inlining.');
  }

  const bgUrl = URL.createObjectURL(new Blob([safeBgSvg], { type:'image/svg+xml;charset=utf-8' }));
  try{
    const bgImg = await load(bgUrl);
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(bgImg, 0, 0, size, size);
  }finally{
    URL.revokeObjectURL(bgUrl);
  }

  const artImg = await load(embedded);
  ctx.drawImage(artImg, 0, 0, size, size);
  try{ ctx.getImageData(0, 0, 1, 1); }catch(e){ throw new Error('Canvas was tainted after SVG background/art render.'); }
  return canvas;
}

async function _fetchLiveImageUrlForDownload(id){
  try{
    const CONTRACT = (typeof LIVE_CONTRACT !== 'undefined' && LIVE_CONTRACT) ? LIVE_CONTRACT : '0x078be86f3104a32313a47815792230a3808642cc';
    const wr = await fetch(`${LIVE_ENDPOINT}/os/nft?contract=${CONTRACT}&tokenId=${id}&nocache=1`, { cache:'no-store' });
    if(!wr.ok) return null;
    const wj = await wr.json();
    window._TV_LAST_DOWNLOAD_NFT = wj;
    const liveUrl = wj?.display_image_url || wj?.image_url || wj?.image || wj?.nft?.display_image_url || wj?.nft?.image_url || wj?.nft?.image || null;
    if(!liveUrl) return null;
    _storeFreshImg?.(id, liveUrl);
    return String(liveUrl).trim();
  }catch(_){ return null; }
}

function _extractLiveMetadataBackgroundFill(obj){
  const seen = new Set();
  const clean = v => {
    v = String(v || '').trim();
    if(!v) return null;
    if(/^[0-9a-f]{6}$/i.test(v)) return '#' + v;
    if(/^#[0-9a-f]{3,8}$/i.test(v) || /^rgba?\(/i.test(v) || /^[a-z]+$/i.test(v)) return v;
    return null;
  };
  const walk = o => {
    if(!o || typeof o !== 'object' || seen.has(o)) return null;
    seen.add(o);
    for(const key of ['background_color','backgroundColor','bg_color','bgColor','background','Background']){
      const hit = clean(o[key]);
      if(hit) return hit;
    }
    const attrs = o.attributes || o.traits || o.nft?.traits || o.nft?.attributes;
    if(Array.isArray(attrs)){
      for(const a of attrs){
        const name = String(a?.trait_type || a?.traitType || a?.type || a?.name || '').toLowerCase();
        if(name.includes('background') || name === 'bg'){
          const hit = clean(a?.value || a?.trait_value || a?.display_value);
          if(hit) return hit;
        }
      }
    }
    for(const v of Object.values(o)){
      const hit = walk(v);
      if(hit) return hit;
    }
    return null;
  };
  return walk(obj);
}

async function _getRawSvgForDownload(id){
  id = Number(id);

  // 0) Raw SVG captured before live metadata image refresh can overwrite IMAGES_MAP.
  const cachedRaw = RAW_SVG_DOWNLOAD_CACHE && RAW_SVG_DOWNLOAD_CACHE.get(id);
  if(cachedRaw) return cachedRaw;

  // 1) Current map, but only if it still contains raw SVG/data SVG.
  const mapVal = IMAGES_MAP && IMAGES_MAP.get(id);
  const mapSvg = _svgTextFromAny(mapVal);
  if(mapSvg){ _rememberRawSvgForDownload(id, mapSvg); return mapSvg; }

  // 2) Token row/chunk image field.
  try{
    const row = await fetchRow(id);
    const rowSvg = _svgTextFromAny(row?.image || row?.image_data || row?.svg || row?.data || '');
    if(rowSvg){ _rememberRawSvgForDownload(id, rowSvg); return rowSvg; }
  }catch(_){ }

  // 3) Reload image data directly from token image manifest/chunks.
  try{
    const mr = await fetch(IMAGES_MANIFEST_URL, { cache:'no-store' });
    if(mr.ok){
      const man = await mr.json();
      const chunks = Array.isArray(man) ? man : (man.chunks || []);
      // Try the expected chunk first, then any remaining chunk if manifest fields are vague.
      const ordered = chunks.slice().sort((a,b) => {
        const ahit = (+a.startId <= id && +a.endId >= id) ? 0 : 1;
        const bhit = (+b.startId <= id && +b.endId >= id) ? 0 : 1;
        return ahit - bhit;
      });
      for(const c of ordered){
        const file = (c && (c.file || c.path)) ? String(c.file || c.path) : null;
        if(!file) continue;
        try{
          const r = await fetch(`${DATA_DIR}/${file}`, { cache:'no-store' });
          if(!r.ok) continue;
          const obj = await r.json();
          const v = obj?.[id] ?? obj?.[String(id)];
          const raw = (typeof v === 'string') ? v : (v?.image_url || v?.image || v?.image_data || v?.svg || v?.data || v?.url || v?.uri || '');
          const svg = _svgTextFromAny(raw);
          if(svg){ _rememberRawSvgForDownload(id, svg); return svg; }
        }catch(_){ }
      }
    }
  }catch(_){ }

  // 4) Legacy single image map fallback.
  try{
    const r = await fetch(IMAGES_URL, { cache:'no-store' });
    if(r.ok){
      const raw = await r.json();
      let v = null;
      if(Array.isArray(raw)){
        const hit = raw.find(it => Number(it?.token_id ?? it?.id ?? it?.tokenId) === id);
        v = hit && (hit.image_url || hit.image || hit.image_data || hit.svg || hit.data || hit.url || hit.uri);
      }else if(raw && typeof raw === 'object'){
        v = raw[id] ?? raw[String(id)];
        if(v && typeof v === 'object') v = v.image_url || v.image || v.image_data || v.svg || v.data || v.url || v.uri;
      }
      const svg = _svgTextFromAny(v);
      if(svg){ _rememberRawSvgForDownload(id, svg); return svg; }
    }
  }catch(_){ }

  return null;
}

async function _getTokenDownloadSource(id){
  id = Number(id);

  if((!IMAGES_MAP || !IMAGES_MAP.has(id)) && typeof loadImagesMap === 'function'){
    try{ await loadImagesMap(); }catch(_){ }
  }
  const mapVal = IMAGES_MAP && IMAGES_MAP.get(id);
  if(mapVal){ const mv = String(mapVal).trim(); if(mv) return mv; }

  try{
    const row = await fetchRow(id);
    const src = row.image || row.image_data || row.svg || row.data || imgForId(id);
    if(src){ const sv = String(src).trim(); if(sv) return sv; }
  }catch(_){ }

  return imgForId(id);
}

function _getCurrentModalImageSourceForDownload(id){
  id = Number(id);
  const modal = document.getElementById('modal');
  if(!modal || modal.style.display === 'none' || Number(window._modalCurrentId) !== id) return null;
  const img = document.querySelector('#mImg img');
  const src = img?.currentSrc || img?.src || '';
  return src ? String(src).trim() : null;
}

function _downloadCanvasAsPng(canvas, filename){
  return new Promise((resolve, reject) => {
    try{
      canvas.getContext('2d').getImageData(0, 0, 1, 1);
      canvas.toBlob((blob) => {
        if(!blob) return reject(new Error('Canvas export returned no data.'));
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 250);
        resolve();
      }, 'image/png');
    }catch(e){ reject(e); }
  });
}

async function downloadTokenPng(id, withBg = true){
  const btn      = document.getElementById(withBg ? 'mDownloadBgBtn' : 'mDownloadNoBgBtn');
  const label    = withBg ? 'With BG' : 'No BG';
  const filename = withBg ? `ocas-${id}.png` : `ocas-${id}-nobg.png`;
  _setDownloadBtnState(btn, 'Preparing…', true);

  const SIZE = 4096;
  const resetBtn = () => _setDownloadBtnState(btn, label, false);

  const canvasToDownload = (canvas) => _downloadCanvasAsPng(canvas, filename);

  const makeCanvas = (alpha) => {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d', { alpha });
    ctx.imageSmoothingEnabled = false;
    return { canvas, ctx };
  };

  const loadImage = (src) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load.'));
    img.src = src;
  });

  const assertCanvasExportable = (canvas) => {
    try{
      // Forces the browser to tell us immediately if anything tainted the canvas.
      // This lets With BG fall back instead of getting stuck/failing at toBlob().
      canvas.getContext('2d').getImageData(0, 0, 1, 1);
      return canvas;
    }catch(e){
      throw new Error('Canvas was tainted by a cross-origin image. Falling back to safe SVG render.');
    }
  };

  const drawUrlImageSafely = async (url, alpha) => {
    if(!url) throw new Error('No image URL available.');
    let src = String(url).startsWith('ipfs://') ? ipfsToHttp(url) : String(url);

    // Data SVGs are safest when we parse them and redraw the pieces ourselves.
    // Drawing an SVG as a whole can taint the canvas if it references external assets.
    if(src.startsWith('data:image/svg')){
      const svg = _svgTextFromAny(src);
      if(svg) return await _drawFullSvgSafely(svg, alpha, src, SIZE);
    }

    // Plain data-raster images are safe.
    if(src.startsWith('data:image/')){
      const { canvas, ctx } = makeCanvas(alpha);
      const img = await loadImage(src);
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      return assertCanvasExportable(canvas);
    }

    // Fetch first. Directly drawing cross-origin URLs can taint the canvas.
    const resp = await fetch(src, { cache:'no-store' });
    if(!resp.ok) throw new Error('Could not fetch image.');

    const ct = (resp.headers.get('content-type') || '').toLowerCase();
    const blob = await resp.blob();
    const blobType = (blob.type || '').toLowerCase();
    const looksLikeSvg = ct.includes('svg') || blobType.includes('svg') || /\.svg(?:$|[?#])/i.test(src);

    // Important fix for With BG:
    // OpenSea/live metadata often returns an SVG wrapper. If we draw that wrapper
    // directly and it contains external image references, Chrome marks the canvas
    // as tainted and blocks toBlob(). Instead, parse the SVG and redraw the
    // background fill + embedded character raster ourselves.
    if(looksLikeSvg){
      const svgText = await blob.text();
      return await _drawFullSvgSafely(svgText, alpha, src, SIZE);
    }

    const objUrl = URL.createObjectURL(blob);
    try{
      const { canvas, ctx } = makeCanvas(alpha);
      const img = await loadImage(objUrl);
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      return assertCanvasExportable(canvas);
    }finally{
      URL.revokeObjectURL(objUrl);
    }
  };

  try{
    let canvas = null;

    if(withBg){
      // With BG strategy:
      // SVG is the source of truth for OCAS backgrounds. Render the full SVG so
      // g#Background gradients/patterns are preserved exactly.
      const rawSvg = await _getRawSvgForDownload(id);
      if(rawSvg){
        try{
          canvas = await _drawSvgBackgroundAndEmbeddedArt(rawSvg, false, document.baseURI, SIZE);
        }catch(svgErr){
          console.warn('Safe full SVG download render failed, trying current image fallback:', svgErr);
        }
      }

      const displayedSrc = canvas ? null : _getCurrentModalImageSourceForDownload(id);
      if(!canvas && displayedSrc){
        try{
          canvas = await drawUrlImageSafely(displayedSrc, false);
        }catch(displayErr){
          console.warn('Displayed image download render failed, trying source fallbacks:', displayErr);
        }
      }

      if(!canvas && typeof _getFreshImg === 'function'){
        const freshSrc = _getFreshImg(id);
        if(freshSrc){
          try{
            canvas = await drawUrlImageSafely(freshSrc, false);
          }catch(freshErr){
            console.warn('Fresh image download render failed, trying source fallbacks:', freshErr);
          }
        }
      }

      // For SVG tokens: render raw SVG via owned blob URL (character already
      //   base64-inline, nothing external, canvas never tainted).
      // For PNG tokens: load a fresh <img> with crossOrigin='anonymous' set
      //   BEFORE src is assigned — this is the only reliable way to get a
      //   CORS-clean image for canvas export regardless of browser cache.

      // PNG token: load fresh with crossOrigin='anonymous' set before src.
      // Must use cache:'reload' so Chrome doesn't serve the cached non-CORS version.
      if(!canvas){
        const mapVal = IMAGES_MAP && IMAGES_MAP.get(Number(id));
        const imgSrc = (mapVal && !_svgTextFromAny(mapVal))
          ? String(mapVal).trim()
          : imgForId(id);
        const url = imgSrc.startsWith('ipfs://') ? ipfsToHttp(imgSrc) : imgSrc;

        // Fetch as blob with cache-bust so browser can't serve the cached
        // non-CORS version, then draw via object URL (always taint-free).
        try{
          const resp = await fetch(url + (url.includes('?') ? '&' : '?') + '_dl=1');
          if(!resp.ok) throw new Error('fetch ' + resp.status);
          const blob   = await resp.blob();
          const objUrl = URL.createObjectURL(blob);
          try{
            const { canvas: c2, ctx } = makeCanvas(false);
            const img = await loadImage(objUrl);
            ctx.drawImage(img, 0, 0, SIZE, SIZE);
            canvas = c2;
          }finally{ URL.revokeObjectURL(objUrl); }
        }catch(e){ console.warn('PNG blob fetch failed:', e.message); }
      }

      if(!canvas) throw new Error('Could not load token image for download.');
    }else{
      // Transparent/no-background: draw only the embedded token art.
      let rawSvg = await _getRawSvgForDownload(id);

      // Fallback to the older working path: check the current download source/map again.
      if(!rawSvg){
        const src = await _getTokenDownloadSource(id);
        rawSvg = _svgTextFromAny(src);
      }

      if(!rawSvg) throw new Error('No raw SVG found for this token. Try refreshing the page, then open the token and use No BG again.');

      const embedded = _extractEmbeddedRasterFromSvg(_svgWithoutBackgroundGroup(rawSvg));
      if(!embedded) throw new Error('No embedded character image found in this token SVG.');

      const made = makeCanvas(true);
      canvas = made.canvas;
      const ctx = made.ctx;
      ctx.clearRect(0, 0, SIZE, SIZE);
      const img = await loadImage(embedded);
      ctx.drawImage(img, 0, 0, SIZE, SIZE);
    }

    await canvasToDownload(canvas);
    resetBtn();
  }catch(e){
    console.error('downloadTokenPng:', e);
    alert('Download error: ' + (e?.message || String(e)));
    resetBtn();
  }
}

function _shareCardShortAddr(addr){
  addr = String(addr || '').trim();
  return addr ? addr.slice(0,6) + '...' + addr.slice(-4) : '';
}

function _shareCardTraitRows(row, limit = 5){
  const kv = typeof keepEntries === 'function' ? keepEntries(row?.traits || {}) : Object.entries(row?.traits || {});
  const total = TOKEN_COUNT || 10000;
  const rows = kv.map(([trait, value]) => {
    const count = TRAIT_FREQ?.[trait]?.[value] || null;
    const pct = count ? (count / total * 100) : null;
    const score = pct ? -Math.log(Math.max(count / total, 1e-12)) : 0;
    return { trait, value, count, pct, score };
  });
  rows.sort((a,b) => (b.score - a.score) || String(a.trait).localeCompare(String(b.trait)));
  return rows.slice(0, limit);
}

function _roundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function _drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines){
  const words = String(text || '').split(/\s+/).filter(Boolean);
  let line = '';
  let lines = 0;
  for(let i = 0; i < words.length; i++){
    const test = line ? line + ' ' + words[i] : words[i];
    if(ctx.measureText(test).width > maxWidth && line){
      ctx.fillText(line, x, y);
      y += lineHeight;
      lines++;
      line = words[i];
      if(lines >= maxLines) return y;
    }else{
      line = test;
    }
  }
  if(line && lines < maxLines){
    ctx.fillText(line, x, y);
    y += lineHeight;
  }
  return y;
}

function _ellipsizeCanvasText(ctx, text, maxWidth){
  text = String(text || '');
  if(ctx.measureText(text).width <= maxWidth) return text;
  let lo = 0, hi = text.length;
  while(lo < hi){
    const mid = Math.ceil((lo + hi) / 2);
    if(ctx.measureText(text.slice(0, mid).trimEnd() + '...').width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + '...';
}

function _drawShareCardRank(ctx, rank, x, y){
  if(!rank) return;
  const color = typeof rankColor === 'function' ? rankColor(rank) : '#e6edf7';
  ctx.save();
  ctx.fillStyle = color;
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(0, -9);
  ctx.bezierCurveTo(0, -9, 3, -1, 12, 0);
  ctx.bezierCurveTo(12, 0, 3, 1, 0, 13);
  ctx.bezierCurveTo(0, 13, -3, 1, -12, 0);
  ctx.bezierCurveTo(-12, 0, -3, -1, 0, -9);
  ctx.closePath();
  ctx.fill();
  ctx.font = '800 28px Space Grotesk, Segoe UI, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(rank), 17, 10);
  ctx.restore();
}

async function _tokenCanvasWithBackground(id, size){
  const rawSvg = await _getRawSvgForDownload(id);
  if(rawSvg) return _drawSvgBackgroundAndEmbeddedArt(rawSvg, false, document.baseURI, size);

  const src = _getCurrentModalImageSourceForDownload(id) || (typeof _getFreshImg === 'function' ? _getFreshImg(id) : null) || await _getTokenDownloadSource(id);
  if(!src) throw new Error('No token image source available for share card.');

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { alpha:false });
  ctx.imageSmoothingEnabled = false;
  const img = await new Promise((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Token image failed to load for share card.'));
    el.src = String(src).startsWith('ipfs://') ? ipfsToHttp(src) : String(src);
  });
  ctx.drawImage(img, 0, 0, size, size);
  ctx.getImageData(0, 0, 1, 1);
  return canvas;
}

function _getShareCardPalette(styleOverride){
  const style = styleOverride || document.getElementById('mShareCardPalette')?.value || 'default';
  const palettes = {
    default: {
      bg:['#08111a','#0d1d24','#10162a','#070b12'],
      wash:'rgba(28,255,175,.28)', washMid:'rgba(28,255,175,.075)', wash2:'rgba(103,232,249,.22)', wash2Mid:'rgba(103,232,249,.055)',
      glass:'rgba(8,14,23,.70)', glass2:'rgba(255,255,255,.075)', border:'rgba(255,255,255,.12)', glow:'rgba(28,255,175,.23)',
      stat:'#d7f7ef', statBg:'rgba(28,255,175,.085)', statBorder:'rgba(28,255,175,.20)',
      traitLabel:'#aab7ca', traitValue:'#eef4ff', traitAccent:'#67e8f9',
      traitRow:'rgba(255,255,255,.055)', traitBorder:'rgba(255,255,255,.075)', artFill:'rgba(255,255,255,.065)'
    },
    dark: {
      bg:['#020304','#05070b','#080b11','#000102'],
      wash:'rgba(255,255,255,.10)', washMid:'rgba(255,255,255,.035)', wash2:'rgba(28,255,175,.12)', wash2Mid:'rgba(28,255,175,.035)',
      glass:'rgba(2,4,8,.82)', glass2:'rgba(255,255,255,.060)', border:'rgba(226,232,240,.16)', glow:'rgba(255,255,255,.16)',
      stat:'#f3f4f6', statBg:'rgba(255,255,255,.095)', statBorder:'rgba(255,255,255,.18)',
      traitLabel:'#b9c1cf', traitValue:'#ffffff', traitAccent:'#93c5fd',
      traitRow:'rgba(255,255,255,.070)', traitBorder:'rgba(255,255,255,.11)', artFill:'rgba(255,255,255,.095)'
    },
    glow: {
      bg:['#050816','#071520','#140b2d','#02040d'],
      wash:'rgba(34,211,238,.34)', washMid:'rgba(34,211,238,.095)', wash2:'rgba(167,139,250,.38)', wash2Mid:'rgba(167,139,250,.10)',
      glass:'rgba(5,10,24,.70)', glass2:'rgba(255,255,255,.090)', border:'rgba(125,211,252,.28)', glow:'rgba(125,211,252,.38)',
      stat:'#e0f2fe', statBg:'rgba(34,211,238,.105)', statBorder:'rgba(167,139,250,.26)',
      traitLabel:'#bae6fd', traitValue:'#f8fafc', traitAccent:'#d8b4fe',
      traitRow:'rgba(125,211,252,.065)', traitBorder:'rgba(167,139,250,.16)', artFill:'rgba(34,211,238,.075)'
    },
    minimal: {
      bg:['#111827','#162033','#1e293b','#0f172a'],
      wash:'rgba(255,255,255,.085)', washMid:'rgba(255,255,255,.026)', wash2:'rgba(28,255,175,.085)', wash2Mid:'rgba(28,255,175,.024)',
      glass:'rgba(15,23,42,.68)', glass2:'rgba(255,255,255,.050)', border:'rgba(255,255,255,.16)', glow:'rgba(255,255,255,.10)',
      stat:'#e5e7eb', statBg:'rgba(255,255,255,.060)', statBorder:'rgba(255,255,255,.15)',
      traitLabel:'#c4ccd8', traitValue:'#f8fafc', traitAccent:'#86efac',
      traitRow:'rgba(255,255,255,.040)', traitBorder:'rgba(255,255,255,.090)', artFill:'rgba(255,255,255,.045)'
    }
  };
  return palettes[style] || palettes.default;
}

async function downloadShareCardPng(id){
  id = Number(id);
  const btn = document.getElementById('mShareCardBtn');
  _setDownloadBtnState(btn, 'Preparing...', true);
  try{
    const row = (typeof ROW_CACHE !== 'undefined' && ROW_CACHE.get(id)) || await fetchRow(id);
    const osRank = OS_RANK_MAP?.get(id) || OS_RANK_MAP?.get(String(id)) || null;
    const traitCount = typeof getTraitCount === 'function' ? getTraitCount(row) : (row?.traits ? Object.keys(row.traits).length : 0);
    const owner = window.OWNER_CACHE?.[id] || document.getElementById('mOwner')?.dataset?.address || '';
    const traits = _shareCardTraitRows(row, 6);
    const pal = _getShareCardPalette();

    const W = 1200, H = 630;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { alpha:false });
    ctx.imageSmoothingEnabled = true;

    const bg = ctx.createLinearGradient(0, 0, W, H);
    bg.addColorStop(0, pal.bg[0]);
    bg.addColorStop(.42, pal.bg[1]);
    bg.addColorStop(.72, pal.bg[2]);
    bg.addColorStop(1, pal.bg[3]);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
    const wash = ctx.createRadialGradient(215, 105, 20, 215, 105, 520);
    wash.addColorStop(0, pal.wash);
    wash.addColorStop(.55, pal.washMid);
    wash.addColorStop(1, 'rgba(45,212,191,0)');
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, W, H);
    const violet = ctx.createRadialGradient(1000, 520, 40, 1000, 520, 560);
    violet.addColorStop(0, pal.wash2);
    violet.addColorStop(.55, pal.wash2Mid);
    violet.addColorStop(1, 'rgba(124,77,255,0)');
    ctx.fillStyle = violet;
    ctx.fillRect(0, 0, W, H);
    const sheen = ctx.createLinearGradient(210, 0, 990, H);
    sheen.addColorStop(0, 'rgba(255,255,255,0)');
    sheen.addColorStop(.5, 'rgba(255,255,255,.055)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(0, 0, W, H);

    ctx.shadowColor = pal.glow;
    ctx.shadowBlur = 34;
    _roundRect(ctx, 36, 36, W - 72, H - 72, 30);
    ctx.fillStyle = pal.glass;
    ctx.fill();
    ctx.shadowBlur = 0;
    const glassTop = ctx.createLinearGradient(36, 36, 36, H - 36);
    glassTop.addColorStop(0, pal.glass2);
    glassTop.addColorStop(.42, 'rgba(255,255,255,.025)');
    glassTop.addColorStop(1, 'rgba(255,255,255,.012)');
    ctx.fillStyle = glassTop;
    ctx.fill();
    ctx.strokeStyle = pal.border;
    ctx.lineWidth = 2;
    ctx.stroke();

    const artCanvas = await _tokenCanvasWithBackground(id, 960);
    const artX = 70, artY = 92, artSize = 430;
    ctx.shadowColor = pal.glow;
    ctx.shadowBlur = 26;
    _roundRect(ctx, artX - 12, artY - 12, artSize + 24, artSize + 24, 24);
    ctx.fillStyle = pal.artFill;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = pal.border;
    ctx.stroke();
    ctx.save();
    _roundRect(ctx, artX, artY, artSize, artSize, 18);
    ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(artCanvas, artX, artY, artSize, artSize);
    ctx.restore();
    ctx.imageSmoothingEnabled = true;

    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 23px Space Grotesk, Segoe UI, sans-serif';
    ctx.fillText('ON-CHAIN', 540, 92);
    ctx.fillStyle = '#1CFFAF';
    ctx.fillText('ALL-STARS', 674, 92);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '800 60px Space Grotesk, Segoe UI, sans-serif';
    const title = '#' + id;
    ctx.fillText(title, 538, 158);
    if(osRank) _drawShareCardRank(ctx, osRank, 560 + ctx.measureText(title).width, 144);

    const stats = [];
    stats.push('Traits: ' + traitCount);
    if(owner) stats.push('Owner ' + _shareCardShortAddr(owner));
    let statX = 540;
    ctx.font = '700 20px Space Grotesk, Segoe UI, sans-serif';
    for(const stat of stats){
      const w = Math.ceil(ctx.measureText(stat).width) + 24;
      _roundRect(ctx, statX, 182, w, 34, 10);
      ctx.fillStyle = pal.statBg;
      ctx.fill();
      ctx.strokeStyle = pal.statBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = pal.stat;
      ctx.fillText(stat, statX + 12, 205);
      statX += w + 12;
    }

    ctx.fillStyle = pal.traitLabel;
    ctx.font = '800 17px Space Grotesk, Segoe UI, sans-serif';
    ctx.fillText('TOP TRAITS', 540, 256);

    let y = 292;
    for(const t of traits){
      _roundRect(ctx, 540, y - 28, 550, 43, 12);
      ctx.fillStyle = pal.traitRow;
      ctx.fill();
      ctx.strokeStyle = pal.traitBorder;
      ctx.lineWidth = 1;
      ctx.stroke();
      const pct = t.pct == null ? '' : (t.pct < .1 ? t.pct.toFixed(3) : t.pct.toFixed(1)) + '%';
      const count = t.count ? t.count + ' tokens' : '';
      ctx.textAlign = 'left';
      ctx.font = '700 12px Space Grotesk, Segoe UI, sans-serif';
      ctx.fillStyle = pal.traitLabel;
      ctx.fillText(_ellipsizeCanvasText(ctx, String(t.trait).toUpperCase(), 290), 558, y - 9);
      ctx.font = '700 19px Space Grotesk, Segoe UI, sans-serif';
      ctx.fillStyle = pal.traitValue;
      ctx.fillText(_ellipsizeCanvasText(ctx, String(t.value), 330), 558, y + 9);
      ctx.textAlign = 'right';
      ctx.font = '800 18px Space Grotesk, Segoe UI, sans-serif';
      ctx.fillStyle = pal.traitAccent;
      ctx.fillText(pct, 1072, y - 6);
      if(count){
        ctx.font = '600 12px Space Grotesk, Segoe UI, sans-serif';
        ctx.fillStyle = pal.traitLabel;
        ctx.fillText(count, 1072, y + 11);
      }
      ctx.textAlign = 'left';
      y += 48;
    }
    if(!traits.length){
      ctx.fillStyle = pal.traitLabel;
      ctx.fillText('No trait data available', 540, y);
    }

    await _downloadCanvasAsPng(canvas, `ocas-${id}-share-card.png`);
  }catch(e){
    console.error('downloadShareCardPng:', e);
    alert('Share card error: ' + (e?.message || String(e)));
  }finally{
    _setDownloadBtnState(btn, 'Share Card PNG', false);
  }
}

async function downloadTokenSvg(id){
  const btn = document.getElementById('mDownloadSvgBtn');
  _setDownloadBtnState(btn, 'Preparing…', true);

  try{
    const s = await _getTokenDownloadSource(id);
    if(!s || !s.startsWith('<svg')){
      alert('SVG download is not available for this token.');
      _setDownloadBtnState(btn, 'SVG', false);
      return;
    }

    const blob = new Blob([s], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ocas-${id}.svg`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 250);
    _setDownloadBtnState(btn, 'SVG', false);
  } catch(e){
    console.error('downloadTokenSvg:', e);
    _setDownloadBtnState(btn, 'SVG', false);
  }
}
