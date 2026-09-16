/* Grid download feature (jv: "get a download of a high quality full set of
   your tokens... 4x4 grid... fully zoomable").
   Composites N selected wallet tokens into one downloadable grid file.
   Reuses the existing per-token image-resolution pipeline
   (_getRawSvgForDownload, _getTokenImgSrcAsync) rather than duplicating it
   -- this module only adds the new part: compositing multiple already-
   resolvable tokens into one file. Classic script, shares the app's global
   scope like every other js/ file here. */

const GRID_DOWNLOAD_MAX_TOKENS = 100; // sane ceiling (10x10) -- no product requirement, just guards against a user selecting an absurd number and hanging their own browser tab

// Same regex-based heuristic as the bot's makeSvgTransparent()
// (commands/download.js) -- duplicated here since the frontend and bot
// are separate codebases, but kept byte-for-byte behaviorally identical
// on purpose so "no background" produces the same result whether it's
// downloaded from Discord or from the website.
// Known limitation, carried over unchanged: this strips the FIRST
// full-canvas rect with a fill, assumed to be a background layer --
// correct for OCAS specifically, but for a collection whose actual
// character art IS built from a full-canvas rect/path (not a separate
// background layer), this would strip the art itself. Same caveat, same
// fix scope as the bot's version -- flagging here rather than silently
// carrying a subtle multi-collection bug forward.
function _gridStripSvgBackground(svgText){
  let out = String(svgText || '');
  out = out.replace(/<rect\b(?=[^>]*(?:width=['"]?100%|width=['"]?\d+))(?=[^>]*(?:height=['"]?100%|height=['"]?\d+))[^>]*(?:fill=['"][^'"]+['"])[^>]*>\s*<\/rect>/i, '');
  out = out.replace(/<rect\b(?=[^>]*(?:width=['"]?100%|width=['"]?\d+))(?=[^>]*(?:height=['"]?100%|height=['"]?\d+))[^>]*\/?>/i, '');
  return out;
}

function _isSvgSource(src){
  if(!src) return false;
  const s = String(src).trim().toLowerCase();
  return s.startsWith('<svg') || s.startsWith('data:image/svg') || s.includes('image/svg');
}

// Resolves one token down to either { kind:'svg', text } or
// { kind:'raster', url } -- whichever the existing pipeline can actually
// give us. Never throws; a token that can't be resolved at all comes
// back null and the caller skips it (with a visible warning) rather than
// silently corrupting the whole grid.
async function _resolveGridToken(id, stripBackground){
  // _getRawSvgForDownload lives in js/downloads.js, which is lazy-loaded
  // on demand (js/downloadLoader.js) rather than loaded upfront -- it may
  // genuinely not exist yet the first time this runs. Ensuring it's
  // actually loaded before relying on it, same as every other download
  // entry point in this app already does.
  if(typeof window.ensureTraitViewDownloadsLoaded === 'function'){
    try{ await window.ensureTraitViewDownloadsLoaded(); }catch(_){ /* falls through to the raster path below */ }
  }
  try{
    if(typeof _getRawSvgForDownload === 'function'){
      const rawSvg = await _getRawSvgForDownload(id);
      if(rawSvg){
        return { kind:'svg', text: stripBackground ? _gridStripSvgBackground(rawSvg) : rawSvg };
      }
    }
  }catch(_){ /* fall through to raster */ }
  try{
    const src = typeof _getTokenImgSrcAsync === 'function' ? await _getTokenImgSrcAsync(id) : (typeof _getTokenImgSrc === 'function' ? _getTokenImgSrc(id) : null);
    if(!src) return null;
    if(_isSvgSource(src)){
      return { kind:'svg', text: stripBackground ? _gridStripSvgBackground(src) : src };
    }
    return { kind:'raster', url: src };
  }catch(_){ return null; }
}

// Picks the smallest square-ish grid (rows == cols, or cols == rows+1)
// that fits `count` cells -- used to auto-suggest a default before the
// user overrides it.
function suggestGridDimensions(count){
  const side = Math.ceil(Math.sqrt(count));
  return { rows: side, cols: side };
}

// Builds one combined SVG document: a grid of cells, each holding either
// the token's real (still-editable, still-vector) SVG markup inlined
// directly -- not rasterized, not embedded as an <image> -- or, for a
// token this pipeline could only resolve to a raster image, an <image>
// element in that one cell. A mixed-source grid still comes out as one
// valid SVG file either way; only the truly-SVG cells get the "fully
// zoomable at any scale" property jv asked for.
function _buildGridSvg(resolvedTokens, rows, cols, cellSize){
  const width = cols * cellSize;
  const height = rows * cellSize;
  const parser = new DOMParser();
  let cellsMarkup = '';

  resolvedTokens.forEach((token, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = col * cellSize;
    const y = row * cellSize;

    if(token.kind === 'svg'){
      try{
        const doc = parser.parseFromString(token.text, 'image/svg+xml');
        const svgEl = doc.documentElement;
        if(doc.querySelector('parsererror')) throw new Error('parse error');
        const viewBox = svgEl.getAttribute('viewBox');
        let vbW = cellSize, vbH = cellSize;
        if(viewBox){
          const parts = viewBox.split(/\s+/).map(Number);
          if(parts.length === 4){ vbW = parts[2] || cellSize; vbH = parts[3] || cellSize; }
        }
        const scale = Math.min(cellSize / vbW, cellSize / vbH);
        const offsetX = (cellSize - vbW * scale) / 2;
        const offsetY = (cellSize - vbH * scale) / 2;
        const inner = svgEl.innerHTML;
        cellsMarkup += `<g transform="translate(${x + offsetX}, ${y + offsetY}) scale(${scale})">${inner}</g>`;
      }catch(_){
        // Malformed SVG somehow slipped through -- skip this cell rather
        // than let one bad token corrupt the whole combined file.
      }
    } else if(token.kind === 'raster'){
      cellsMarkup += `<image x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" preserveAspectRatio="xMidYMid meet" href="${token.url}"/>`;
    }
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">${cellsMarkup}</svg>`;
}

// Rasterizes one token (SVG markup or a raster URL) onto an offscreen
// canvas at its grid cell position. Used for the PNG/JPEG output paths --
// SVG output (_buildGridSvg above) never touches a canvas at all, which
// is exactly what keeps it genuinely zoomable rather than resolution-
// limited.
function _drawTokenOnCanvas(ctx, token, x, y, cellSize){
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const scale = Math.min(cellSize / img.naturalWidth, cellSize / img.naturalHeight);
      const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
      const offsetX = x + (cellSize - w) / 2, offsetY = y + (cellSize - h) / 2;
      try{ ctx.drawImage(img, offsetX, offsetY, w, h); }catch(_){}
      resolve();
    };
    img.onerror = () => resolve(); // skip this cell rather than fail the whole grid
    if(token.kind === 'svg'){
      img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(token.text)));
    }else{
      img.src = token.url;
    }
  });
}

async function _buildGridRaster(resolvedTokens, rows, cols, cellSize, format, transparentBg){
  const canvas = document.createElement('canvas');
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;
  const ctx = canvas.getContext('2d');
  // JPEG has no alpha channel -- transparent cells would otherwise come
  // out black. Fill white first for JPEG specifically; PNG stays truly
  // transparent when transparentBg is requested.
  if(format === 'jpeg' || !transparentBg){
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  for(let i = 0; i < resolvedTokens.length; i++){
    const row = Math.floor(i / cols);
    const col = i % cols;
    await _drawTokenOnCanvas(ctx, resolvedTokens[i], col * cellSize, row * cellSize, cellSize);
  }
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), format === 'jpeg' ? 'image/jpeg' : 'image/png', 0.92);
  });
}

// Main entry point. ids: array of token IDs already selected by the user.
// options: { rows, cols, format: 'svg'|'png'|'jpeg', transparentBg, cellSize }
// Returns nothing -- triggers a browser download directly, same UX as
// every other download function in js/downloads.js.
async function downloadTokenGrid(ids, options, onProgress){
  const { rows, cols, format, transparentBg } = options;
  const cellSize = options.cellSize || 1000;
  const capped = ids.slice(0, GRID_DOWNLOAD_MAX_TOKENS);
  const resolved = [];
  for(let i = 0; i < capped.length; i++){
    if(onProgress) onProgress(i + 1, capped.length);
    const token = await _resolveGridToken(capped[i], transparentBg);
    if(token) resolved.push(token);
    else console.warn(`[gridDownload] Could not resolve an image for token #${capped[i]} -- skipped`);
  }
  if(!resolved.length){
    alert('Could not resolve any of the selected tokens\' images. Please try again.');
    return;
  }

  const slugPart = (typeof LIVE_SLUG !== 'undefined' && LIVE_SLUG) ? LIVE_SLUG : 'traitview';
  const filename = `${slugPart}-grid-${rows}x${cols}`;

  if(format === 'svg'){
    const svgText = _buildGridSvg(resolved, rows, cols, cellSize);
    const blob = new Blob([svgText], { type: 'image/svg+xml' });
    _triggerBlobDownload(blob, `${filename}.svg`);
  }else{
    const blob = await _buildGridRaster(resolved, rows, cols, cellSize, format, transparentBg);
    if(!blob){
      alert('Something went wrong building the image. Please try again.');
      return;
    }
    _triggerBlobDownload(blob, `${filename}.${format === 'jpeg' ? 'jpg' : 'png'}`);
  }
}

function _triggerBlobDownload(blob, filename){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ---------- Modal / selection-mode wiring ----------
// window._gridSelectMode is checked by _renderDesktopWalletGrid and
// _renderMobileWalletGrid (js/app.js) -- when truthy, a card click toggles
// selection instead of opening the token modal / closing the wallet
// drawer. window._gridDownloadSelected holds the actual selected IDs.

function openGridDownloadModal(view){
  window._gridSelectMode = true;
  window._gridDownloadView = view; // 'desktop' | 'mobile'
  window._gridDownloadSelected = new Set();
  const overlay = document.getElementById('gridDownloadOverlay');
  if(overlay) overlay.style.display = 'flex';
  gridDownloadOnFormatChange();
  _updateGridDownloadCount();
}

// jv confirmed live: expected the Download Grid button in "Connected
// Holder" (the stats-only panel for a connected wallet), not "Wallet
// View" (the separate manual-lookup drawer, which is the only one that
// actually has a token grid to select from). Rather than build a second,
// separate selection UI for Connected Holder, this reuses the existing
// Wallet View drawer -- opens it pre-filled with the connected wallet's
// own address (mirroring openWalletView()'s own mobile/desktop routing,
// window.innerWidth <= 1100), waits for that grid to actually finish
// loading (both lookup functions are normally fire-and-forget here --
// awaiting them directly rather than guessing at a delay), then opens
// the download modal on top of it.
async function openGridDownloadFromConnectedHolder(){
  if(!CONNECTED_WALLET?.address){
    alert('Connect a wallet first.');
    return;
  }
  const addr = CONNECTED_WALLET.address;
  const isMobile = window.innerWidth <= 1100;

  if(isMobile){
    const drawer = document.getElementById('mobileWalletDrawer');
    const overlay = document.getElementById('mobileWalletOverlay');
    if(!drawer || !overlay) return;
    if(typeof closeMobileHolderDrawer === 'function') closeMobileHolderDrawer();
    drawer.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    const inp = document.getElementById('mobileWalletInput');
    if(inp) inp.value = addr;
    const status = document.getElementById('mobileWalletStatus');
    if(status) status.textContent = 'Loading…';
    if(typeof mobileWalletLookup === 'function') await mobileWalletLookup();
    openGridDownloadModal('mobile');
  }else{
    if(typeof toggleWalletDrawer === 'function') toggleWalletDrawer(true);
    const input = document.getElementById('desktopWalletInput');
    if(input) input.value = addr;
    const status = document.getElementById('desktopWalletStatus');
    if(status) status.textContent = 'Loading…';
    if(typeof desktopWalletLookup === 'function') await desktopWalletLookup();
    openGridDownloadModal('desktop');
  }
}

function closeGridDownloadModal(){
  window._gridSelectMode = false;
  const overlay = document.getElementById('gridDownloadOverlay');
  if(overlay) overlay.style.display = 'none';
  // Clear the visual "selected" state from any cards still in the DOM.
  document.querySelectorAll('[data-token-id].grid-dl-selected').forEach(el => el.classList.remove('grid-dl-selected'));
}

function toggleGridDownloadSelection(id, cardEl){
  const set = window._gridDownloadSelected || (window._gridDownloadSelected = new Set());
  if(set.has(id)){
    set.delete(id);
    if(cardEl) cardEl.classList.remove('grid-dl-selected');
  }else{
    if(set.size >= GRID_DOWNLOAD_MAX_TOKENS){
      alert(`You can select up to ${GRID_DOWNLOAD_MAX_TOKENS} tokens at once.`);
      return;
    }
    set.add(id);
    if(cardEl) cardEl.classList.add('grid-dl-selected');
  }
  _updateGridDownloadCount();
}

function _updateGridDownloadCount(){
  const el = document.getElementById('gridDownloadSelectedCount');
  const n = window._gridDownloadSelected ? window._gridDownloadSelected.size : 0;
  if(el) el.textContent = `${n} selected`;
}

function gridDownloadSelectAll(){
  const view = window._gridDownloadView;
  const ids = view === 'mobile' ? window._mobileWalletIds : (window._desktopWalletIdsFiltered || window._desktopWalletIds);
  if(!ids) return;
  const capped = ids.slice(0, GRID_DOWNLOAD_MAX_TOKENS);
  window._gridDownloadSelected = new Set(capped);
  document.querySelectorAll('[data-token-id]').forEach(el => {
    const id = Number(el.dataset.tokenId);
    el.classList.toggle('grid-dl-selected', window._gridDownloadSelected.has(id));
  });
  if(ids.length > GRID_DOWNLOAD_MAX_TOKENS){
    alert(`Selected the first ${GRID_DOWNLOAD_MAX_TOKENS} tokens (the max for one grid).`);
  }
  _updateGridDownloadCount();
}

function gridDownloadClearAll(){
  window._gridDownloadSelected = new Set();
  document.querySelectorAll('[data-token-id].grid-dl-selected').forEach(el => el.classList.remove('grid-dl-selected'));
  _updateGridDownloadCount();
}

function gridDownloadOnFormatChange(){
  const format = document.getElementById('gridDownloadFormat')?.value;
  const row = document.getElementById('gridDownloadTransparentRow');
  const checkbox = document.getElementById('gridDownloadTransparent');
  // JPEG has no alpha channel -- a "no background" option would be
  // meaningless (and misleading) for it, so disable rather than let
  // someone pick a combination that can't actually do what it says.
  const disabled = format === 'jpeg';
  if(checkbox) checkbox.disabled = disabled;
  if(row) row.style.opacity = disabled ? '0.45' : '1';
  if(disabled && checkbox) checkbox.checked = false;
}

async function gridDownloadGo(){
  const selected = window._gridDownloadSelected;
  if(!selected || !selected.size){
    alert('Select at least one token first.');
    return;
  }
  const gridSize = parseInt(document.getElementById('gridDownloadSize')?.value || '4', 10);
  const format = document.getElementById('gridDownloadFormat')?.value || 'svg';
  const transparentBg = !!document.getElementById('gridDownloadTransparent')?.checked;
  const capacity = gridSize * gridSize;
  let ids = [...selected];
  if(ids.length > capacity){
    alert(`You selected ${ids.length} tokens but a ${gridSize}×${gridSize} grid only fits ${capacity}. Using the first ${capacity}.`);
    ids = ids.slice(0, capacity);
  }

  const btn = document.getElementById('gridDownloadGoBtn');
  const progressEl = document.getElementById('gridDownloadProgress');
  if(btn){ btn.disabled = true; btn.textContent = 'Building…'; }
  if(progressEl) progressEl.style.display = 'block';

  try{
    await downloadTokenGrid(ids, { rows: gridSize, cols: gridSize, format, transparentBg }, (done, total) => {
      if(progressEl) progressEl.textContent = `Resolving images: ${done} / ${total}`;
    });
    closeGridDownloadModal();
  }catch(e){
    console.error('[gridDownload] Failed:', e);
    alert('Something went wrong building the grid. Please try again.');
  }finally{
    if(btn){ btn.disabled = false; btn.textContent = 'Download'; }
    if(progressEl) progressEl.style.display = 'none';
  }
}
