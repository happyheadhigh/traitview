/* TraitView landing page.
   Only does anything when window.__TV_LANDING__ is true (set by the inline
   script at the top of <head> for a bare traitview.com visit with no
   ?collection=, ?jump=/?token=, or /token/:slug/:id in the URL).
   Classic script, loaded after config.js (COLLECTIONS/loadDynamicCollections/
   LIVE_ENDPOINT/BOT_DISCORD_INVITE_URL) and landingPrefs.js (the local
   preference layer). */

if(window.__TV_LANDING__){

  // jv: link to Twitter as the creator. Placeholder handle -- swap in the
  // real one.
  const CREATOR_TWITTER_URL = 'https://twitter.com/YOUR_HANDLE_HERE';

  const FAQ_ITEMS = [
    {
      q: 'What is TraitView?',
      a: 'TraitView is a live trait explorer, rarity ranker, and marketplace tracker for NFT collections. It shows every token\'s traits, computed rarity rank, current OpenSea listing (if any), and recent sales history -- all kept up to date automatically, not a one-time snapshot.',
    },
    {
      q: 'How does this connect to the Discord bot?',
      a: 'A companion Discord bot backfills a collection\'s on-chain trait data, tracks live listings and sales, and posts real-time alerts to a server when something sells or gets listed. Every one of those alerts links straight back to the exact token here on TraitView.',
    },
    {
      q: 'Can I add my own collection?',
      a: 'Yes -- run /setup and /config directly in the bot. No need to reach out anywhere first; once a collection is backfilled it automatically shows up here on the landing page and in the collection switcher.',
    },
    {
      q: 'Is the listing/sales data live?',
      a: 'Yes. Listings and sales are synced continuously (not fetched once and cached forever), so prices, floor, and volume reflect the current market rather than a stale snapshot from whenever the page first loaded.',
    },
    {
      q: 'What can I do with the collection cards?',
      a: 'Reorder them by dragging (in Customize mode), hide ones you don\'t care about, and search by name -- all saved locally in your browser, never affecting what anyone else sees or what\'s actually in the database.',
    },
    {
      q: 'Why was this built?',
      a: 'TraitView started as a tool for the On-Chain All Stars community specifically, and grew from there into something built for other collections too. It\'s a side project, kept up because it\'s genuinely useful -- not a commercial product.',
    },
  ];

  // Real bot commands only (register-commands.js) -- no invented
  // functionality. Excludes anything admin/owner-only.
  const BOT_DEMO_ITEMS = [
    { label: '/sweep', detail: 'Estimate the ETH cost to sweep the cheapest listed tokens' },
    { label: '/rankfind', detail: 'Find listings or sales by rarity rank range' },
    { label: '/traitfind', detail: 'Find tokens, listings, or sales by trait' },
    { label: '/lastsale', detail: 'Show the most recent sale, instantly' },
    { label: '/me', detail: 'Your personal hub — alerts, wallet, preferences' },
    { label: '/arbitrage', detail: 'Spot listings priced below the best current offer' },
  ];
  const BOT_PILLS = ['Sales', 'Listings', 'Rank Filters', 'Trait Filters', 'Sweeps', 'Arbitrage', 'Personal Alerts', 'Portfolio'];

  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let customizeMode = false;
  let currentOrder = [];   // slugs, in display order
  let hiddenSet = new Set();
  let collectionInfoCache = {}; // slug -> {name, image_url, banner_image_url} | null
  let floorCache = {};          // slug -> number | null

  // ---------- Hero ----------
  function wireHero(){
    const exploreBtn = document.getElementById('landingExploreBtn');
    if(exploreBtn) exploreBtn.addEventListener('click', (e) => {
      e.preventDefault();
      const grid = document.getElementById('landingCollectionsSection');
      if(grid) grid.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    });
    document.querySelectorAll('.landing-bot-invite').forEach(el => { el.href = BOT_DISCORD_INVITE_URL; });
  }

  // ---------- FAQ (now a modal, not auto-shown -- see floating controls) ----------
  function renderFaq(){
    const host = document.getElementById('landingFaq');
    if(!host) return;
    host.innerHTML = FAQ_ITEMS.map((item, i) => `
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;overflow:hidden">
        <button type="button" class="landing-faq-q" data-i="${i}" style="width:100%;text-align:left;background:none;border:none;color:var(--text);font-size:14px;font-weight:600;padding:14px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px">
          <span>${item.q}</span>
          <span class="landing-faq-caret" style="color:var(--sub);transition:transform .15s ease">▾</span>
        </button>
        <div class="landing-faq-a" style="display:none;padding:0 16px 14px;color:var(--sub);font-size:13px;line-height:1.6">${item.a}</div>
      </div>
    `).join('');
    host.querySelectorAll('.landing-faq-q').forEach(btn => {
      btn.addEventListener('click', () => {
        const body = btn.parentElement.querySelector('.landing-faq-a');
        const caret = btn.querySelector('.landing-faq-caret');
        const open = body.style.display !== 'none';
        body.style.display = open ? 'none' : 'block';
        if(caret) caret.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
      });
    });
  }

  function setTwitterLink(){
    const el = document.getElementById('landingTwitterLink');
    if(el) el.href = CREATOR_TWITTER_URL;
  }

  // ---------- Floating help/community controls ----------
  // jv: replaced the always-visible FAQ block with small floating
  // controls near the bottom-right -- [?] opens the FAQ modal, [bot icon]
  // is the same real bot-invite link used in the hero/bot-showcase CTAs.
  // No separate "community Discord" exists (confirmed) -- the Discord
  // icon IS the bot invite.
  function wireFloatingControls(){
    const helpBtn = document.getElementById('landingHelpBtn');
    const botBtn = document.getElementById('landingFloatingBotBtn');
    const modal = document.getElementById('landingFaqModal');
    const closeBtn = document.getElementById('landingFaqCloseBtn');
    const backdrop = modal ? modal.querySelector('.landing-modal-backdrop') : null;
    if(botBtn) botBtn.href = BOT_DISCORD_INVITE_URL;
    function openFaq(){ if(modal) modal.style.display = 'flex'; }
    function closeFaq(){ if(modal) modal.style.display = 'none'; }
    if(helpBtn) helpBtn.addEventListener('click', openFaq);
    if(closeBtn) closeBtn.addEventListener('click', closeFaq);
    if(backdrop) backdrop.addEventListener('click', closeFaq);
    document.addEventListener('keydown', (e) => { if(e.key === 'Escape') closeFaq(); });
  }

  // ---------- Bot showcase: cycling demo ----------
  function wireBotShowcase(){
    document.querySelectorAll('.landing-bot-invite').forEach(el => { el.href = BOT_DISCORD_INVITE_URL; });
    const pillsHost = document.getElementById('landingBotPills');
    if(pillsHost){
      pillsHost.innerHTML = BOT_PILLS.map(p => `<span style="display:inline-block;background:var(--panel);border:1px solid var(--border);border-radius:999px;padding:6px 14px;font-size:12px;font-weight:600;color:var(--sub);white-space:nowrap">${p}</span>`).join('');
    }
    const demoHost = document.getElementById('landingBotDemo');
    if(!demoHost) return;
    let i = 0;
    function paint(){
      const item = BOT_DEMO_ITEMS[i % BOT_DEMO_ITEMS.length];
      demoHost.style.opacity = '0';
      setTimeout(() => {
        demoHost.innerHTML = `
          <div style="font-family:monospace;color:#2dd4bf;font-size:15px;font-weight:700">${item.label}</div>
          <div style="color:var(--sub);font-size:13px;margin-top:4px">${item.detail}</div>
        `;
        demoHost.style.opacity = '1';
      }, prefersReducedMotion ? 0 : 200);
      i++;
    }
    paint();
    if(!prefersReducedMotion) setInterval(paint, 3200);
  }

  // ---------- Collection cards ----------
  async function fetchCollectionInfo(slug){
    if(slug in collectionInfoCache) return collectionInfoCache[slug];
    try{
      const r = await fetch(`${LIVE_ENDPOINT}/os/collection-info?slug=${encodeURIComponent(slug)}`, { cache:'no-store' });
      if(!r.ok){
        console.warn(`[landing] /os/collection-info?slug=${slug} returned ${r.status} -- is the Worker's latest version actually deployed?`);
        collectionInfoCache[slug] = null;
        return null;
      }
      const j = await r.json();
      collectionInfoCache[slug] = j?.ok ? j : null;
      return collectionInfoCache[slug];
    }catch(e){
      console.warn(`[landing] /os/collection-info?slug=${slug} fetch failed:`, e.message);
      collectionInfoCache[slug] = null;
      return null;
    }
  }

  // Real floor price only -- /os/stats already exists and already proxies
  // OpenSea's own collection stats (the same source the main app's own
  // stats bar uses). Never mocked; a card simply omits the badge if this
  // comes back empty.
  async function fetchFloor(slug){
    if(slug in floorCache) return floorCache[slug];
    try{
      const r = await fetch(`${LIVE_ENDPOINT}/os/stats?slug=${encodeURIComponent(slug)}`, { cache:'no-store' });
      if(!r.ok){ floorCache[slug] = null; return null; }
      const j = await r.json();
      const floor = j?.total?.floor_price ?? j?.stats?.floor_price ?? null;
      floorCache[slug] = (typeof floor === 'number' && floor > 0) ? floor : null;
      return floorCache[slug];
    }catch(_){ floorCache[slug] = null; return null; }
  }

  function floorBadgeHtml(floor){
    if(floor == null) return '';
    const display = floor >= 1 ? floor.toFixed(2) : floor.toFixed(4);
    return `<span class="landing-floor-badge">Ξ ${display} <span style="opacity:.7;font-weight:500">floor</span></span>`;
  }

  function collectionCardHtml(slug, entry, info, floor){
    const name = info?.name || entry.name || slug;
    const banner = info?.banner_image_url;
    const avatar = info?.image_url;
    const bannerStyle = banner
      ? `background-image:linear-gradient(180deg,rgba(0,0,0,.1),rgba(0,0,0,.6)),url('${banner.replace(/'/g,"%27")}');background-size:cover;background-position:center`
      : 'background:var(--soft)';
    const isFav = isLandingFavorite(slug);
    return `
      <div class="landing-card" data-slug="${slug}" style="position:relative;border-radius:14px;overflow:hidden;border:1px solid var(--border);height:160px;${bannerStyle}">
        ${customizeMode ? `<span class="landing-drag-handle" title="Drag to reorder" style="position:absolute;top:10px;left:10px;z-index:2;background:rgba(0,0,0,.55);color:#fff;width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:grab;font-size:16px;touch-action:none">⠿</span>` : ''}
        <button type="button" class="landing-card-menu-btn" data-slug="${slug}" style="position:absolute;top:10px;right:10px;z-index:2;background:rgba(0,0,0,.55);color:#fff;width:30px;height:30px;border-radius:8px;border:none;cursor:pointer;font-size:16px;line-height:1">•••</button>
        <div class="landing-card-menu" data-slug="${slug}" style="display:none;position:absolute;top:44px;right:10px;z-index:3;background:var(--panel);border:1px solid var(--border);border-radius:10px;overflow:hidden;min-width:150px;box-shadow:0 8px 24px rgba(0,0,0,.35)">
          <button type="button" class="landing-card-menu-item" data-action="top" data-slug="${slug}" style="display:block;width:100%;text-align:left;padding:10px 14px;background:none;border:none;color:var(--text);font-size:13px;cursor:pointer">Move to top</button>
          <button type="button" class="landing-card-menu-item" data-action="fav" data-slug="${slug}" style="display:block;width:100%;text-align:left;padding:10px 14px;background:none;border:none;color:var(--text);font-size:13px;cursor:pointer">${isFav ? '★ Unfavorite' : '☆ Favorite'}</button>
          <button type="button" class="landing-card-menu-item" data-action="hide" data-slug="${slug}" style="display:block;width:100%;text-align:left;padding:10px 14px;background:none;border:none;color:#f87171;font-size:13px;cursor:pointer">Hide collection</button>
        </div>
        <a href="?collection=${encodeURIComponent(slug)}" class="landing-card-link" draggable="false" style="position:absolute;inset:0;display:flex;align-items:flex-end;justify-content:space-between;padding:14px;gap:10px;text-decoration:none;color:inherit">
          <div style="display:flex;align-items:center;gap:10px;min-width:0">
            ${avatar ? `<img src="${avatar}" alt="" style="width:40px;height:40px;border-radius:10px;border:2px solid rgba(255,255,255,.85);object-fit:cover;flex-shrink:0">` : ''}
            <div style="font-weight:700;font-size:15px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6);line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}${isFav ? ' ★' : ''}</div>
          </div>
          ${floorBadgeHtml(floor)}
        </a>
      </div>
    `;
  }

  function getVisibleOrder(){
    const q = (document.getElementById('landingSearch')?.value || '').trim().toLowerCase();
    return currentOrder.filter(slug => {
      if(hiddenSet.has(slug) && !customizeMode) return false;
      if(q){
        const name = (collectionInfoCache[slug]?.name || COLLECTIONS[slug]?.name || slug).toLowerCase();
        if(!name.includes(q) && !slug.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }

  function renderHiddenCount(){
    const btn = document.getElementById('landingHiddenBtn');
    if(btn) btn.textContent = `Hidden (${hiddenSet.size})`;
  }

  async function renderCollectionsGrid(){
    const host = document.getElementById('landingCollectionsGrid');
    if(!host) return;
    const visible = getVisibleOrder();
    if(!visible.length){
      host.innerHTML = `<div style="grid-column:1/-1;color:var(--sub);font-size:13px;text-align:center;padding:20px 0">${currentOrder.length ? 'No collections match your search.' : 'No collections found.'}</div>`;
      return;
    }
    host.innerHTML = visible.map(slug => collectionCardHtml(slug, COLLECTIONS[slug] || { name: slug }, collectionInfoCache[slug], floorCache[slug])).join('');
    wireCardMenus();
    if(customizeMode) wireDragAndDrop();
    // Upgrade each card in place as its banner/avatar/floor data arrives --
    // avoids the whole grid waiting on the slowest fetch before anything
    // is visible at all.
    await Promise.all(visible.map(async slug => {
      const [info, floor] = await Promise.all([fetchCollectionInfo(slug), fetchFloor(slug)]);
      const card = host.querySelector(`.landing-card[data-slug="${CSS.escape(slug)}"]`);
      if(card) card.outerHTML = collectionCardHtml(slug, COLLECTIONS[slug] || { name: slug }, info, floor);
    }));
    wireCardMenus();
    if(customizeMode) wireDragAndDrop();
  }

  function wireCardMenus(){
    document.querySelectorAll('.landing-card-menu-btn').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault(); e.stopPropagation();
        const slug = btn.dataset.slug;
        document.querySelectorAll('.landing-card-menu').forEach(m => { if(m.dataset.slug !== slug) m.style.display = 'none'; });
        const menu = document.querySelector(`.landing-card-menu[data-slug="${CSS.escape(slug)}"]`);
        if(menu) menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
      };
    });
    document.querySelectorAll('.landing-card-menu-item').forEach(btn => {
      btn.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        const slug = btn.dataset.slug;
        const action = btn.dataset.action;
        if(action === 'top'){
          currentOrder = moveLandingCollectionToTop(slug, currentOrder);
        }else if(action === 'hide'){
          hideLandingCollection(slug);
          hiddenSet.add(slug);
          renderHiddenCount();
        }else if(action === 'fav'){
          toggleLandingFavorite(slug);
        }
        await renderCollectionsGrid();
      };
    });
    document.addEventListener('click', () => {
      document.querySelectorAll('.landing-card-menu').forEach(m => { m.style.display = 'none'; });
    });
  }

  // ---------- Drag-and-drop reordering ----------
  // Pointer Events unify mouse and touch in one code path. Only wired up
  // in Customize mode, and only from the dedicated drag-handle icon (not
  // the whole card) -- per the spec's own mobile guidance, so normal
  // vertical scrolling and normal taps are never hijacked.
  function wireDragAndDrop(){
    const host = document.getElementById('landingCollectionsGrid');
    if(!host) return;
    let dragEl = null, startY = 0, startX = 0;

    host.querySelectorAll('.landing-drag-handle').forEach(handle => {
      handle.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const card = handle.closest('.landing-card');
        if(!card) return;
        dragEl = card;
        startX = e.clientX; startY = e.clientY;
        card.setPointerCapture(e.pointerId);
        card.style.zIndex = '10';
        card.style.transition = 'none';
        card.style.transform = 'scale(1.03)';
        card.style.boxShadow = '0 12px 28px rgba(0,0,0,.4)';

        function onMove(ev){
          if(!dragEl) return;
          const dx = ev.clientX - startX, dy = ev.clientY - startY;
          dragEl.style.transform = `translate(${dx}px, ${dy}px) scale(1.03)`;
          // Find the sibling card currently under the pointer and swap
          // positions in the DOM (a "swap while dragging" reorder,
          // matching the spec's "cards rearrange visually while
          // dragging" requirement).
          const under = document.elementFromPoint(ev.clientX, ev.clientY);
          const overCard = under ? under.closest('.landing-card') : null;
          if(overCard && overCard !== dragEl && overCard.parentElement === host){
            const cards = [...host.children];
            const dragIdx = cards.indexOf(dragEl);
            const overIdx = cards.indexOf(overCard);
            if(dragIdx > -1 && overIdx > -1){
              if(dragIdx < overIdx) host.insertBefore(dragEl, overCard.nextSibling);
              else host.insertBefore(dragEl, overCard);
              // Reset transform basis since the element moved in the DOM.
              startX = ev.clientX; startY = ev.clientY;
              dragEl.style.transform = 'scale(1.03)';
            }
          }
        }
        function onUp(ev){
          if(!dragEl) return;
          dragEl.style.transition = prefersReducedMotion ? 'none' : 'transform .15s ease, box-shadow .15s ease';
          dragEl.style.transform = '';
          dragEl.style.boxShadow = '';
          dragEl.style.zIndex = '';
          const newOrder = [...host.children].map(c => c.dataset.slug);
          // Preserve hidden/search-filtered slugs that aren't currently
          // rendered -- only the visible subset was reordered.
          const visibleSet = new Set(newOrder);
          const merged = [];
          let vi = 0;
          for(const slug of currentOrder){
            if(visibleSet.has(slug)){ merged.push(newOrder[vi]); vi++; }
            else merged.push(slug);
          }
          currentOrder = merged;
          setLandingOrder(currentOrder);
          dragEl = null;
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
        }
        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp, { once: true });
      });
    });
  }

  function wireCustomizeToggle(){
    const btn = document.getElementById('landingCustomizeBtn');
    const bar = document.getElementById('landingCustomizeBar');
    const resetBtn = document.getElementById('landingResetBtn');
    if(btn) btn.addEventListener('click', async () => {
      customizeMode = !customizeMode;
      btn.textContent = customizeMode ? 'Done' : 'Customize';
      btn.classList.toggle('active', customizeMode);
      if(bar) bar.style.display = customizeMode ? 'flex' : 'none';
      renderHiddenCount();
      await renderCollectionsGrid();
    });
    if(resetBtn) resetBtn.addEventListener('click', async () => {
      resetLandingLayout();
      const merged = mergeLandingCollections(Object.keys(COLLECTIONS));
      currentOrder = merged.ordered;
      hiddenSet = merged.hidden;
      renderHiddenCount();
      await renderCollectionsGrid();
    });
  }

  function wireSearch(){
    const input = document.getElementById('landingSearch');
    if(!input) return;
    input.addEventListener('input', () => { renderCollectionsGrid(); });
  }

  async function initCollections(){
    // loadDynamicCollections() merges any onboarded collection into
    // COLLECTIONS beyond the hardcoded OCAS/Argonauts baseline -- wait for
    // it so a newly-added collection (like nekoadz) shows up here too,
    // not just after a manual switcher refresh.
    if(typeof loadDynamicCollections === 'function'){
      try{ await loadDynamicCollections(); }catch(_){}
    }
    const dbSlugs = Object.keys(COLLECTIONS);
    const merged = mergeLandingCollections(dbSlugs);
    currentOrder = merged.ordered;
    hiddenSet = merged.hidden;
    renderHiddenCount();
    await renderCollectionsGrid();
  }

  renderFaq();
  setTwitterLink();
  wireHero();
  wireFloatingControls();
  wireBotShowcase();
  wireCustomizeToggle();
  wireSearch();
  initCollections();
}
