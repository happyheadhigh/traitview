/* TraitView landing page.
   Only does anything when window.__TV_LANDING__ is true (set by the inline
   script at the top of <head> for a bare traitview.com visit with no
   ?collection=, ?jump=/?token=, or /token/:slug/:id in the URL).
   Classic script, loaded after config.js (COLLECTIONS/loadDynamicCollections/
   LIVE_ENDPOINT/BOT_DISCORD_INVITE_URL) and landingPrefs.js (the local
   preference layer). */

if(window.__TV_LANDING__){

  // Safety net for the inline <head> script's CSS-only hide (index.html --
  // body > * plus specificity-boosted overrides for #mobileBottomBar and
  // #floatFilterBtn, the two confirmed elements with their own
  // #id{display:...!important} rule elsewhere in css/styles.css that would
  // otherwise still show through). Catches any other such escapee this
  // missed, or one added later, without needing to know its selector in
  // advance -- an inline style with !important priority beats any
  // stylesheet rule regardless of that rule's own specificity.
  document.querySelectorAll('body > *').forEach(el => {
    if(el.id === 'landingPage') return;
    el.style.setProperty('display', 'none', 'important');
  });

  const CREATOR_TWITTER_URL = 'https://x.com/happyheadhigh?s=11&t=hxAwdrwmqftDdnfTLGICcQ';

  // jv: "is there a way to add emojis on each collection... others can
  // see that the collection is liked or flagged" -- "open, but still
  // only 1 tap per person if doable". A fixed set (matches the backend's
  // own REACTION_EMOJI in api.js) rather than free-text input -- a plain
  // button row, no arbitrary-emoji validation needed anywhere. "1 tap per
  // person" without any login system on this site means a persistent
  // anonymous id generated once and stored in this browser -- not
  // airtight against clearing storage or a different device, but the
  // standard approach for a lightweight, no-account reaction like this.
  const REACTION_EMOJI = ['🚀', '❤️', '👀', '🚩'];
  const REACTION_CLIENT_ID_KEY = 'traitview_reaction_client_id';
  function getReactionClientId(){
    try{
      let id = localStorage.getItem(REACTION_CLIENT_ID_KEY);
      if(!id){
        id = (crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        localStorage.setItem(REACTION_CLIENT_ID_KEY, id);
      }
      return id;
    }catch(_){
      return 'anon'; // localStorage unavailable (private mode, etc.) -- still functions, just can't remember the pick across reloads
    }
  }
  let reactionCache = {}; // slug -> {counts, mine: string[]} | 'pending' | null
  async function fetchReactionData(slug){
    if(reactionCache[slug] && reactionCache[slug] !== 'pending') return reactionCache[slug];
    if(reactionCache[slug] === 'pending') return null;
    reactionCache[slug] = 'pending';
    try{
      const qs = new URLSearchParams({ client_id: getReactionClientId(), key: TV_BOT_API_KEY });
      const r = await fetch(`${TV_BOT_API_BASE}/db/collections/${encodeURIComponent(slug)}/reactions?${qs}`);
      const j = r.ok ? await r.json() : null;
      reactionCache[slug] = (j?.ok) ? { counts: j.counts, mine: j.mine || [] } : null;
      return reactionCache[slug];
    }catch(e){
      console.warn(`[landing] reactions fetch failed for ${slug}:`, e.message);
      reactionCache[slug] = null;
      return null;
    }
  }
  async function postReaction(slug, emoji){
    try{
      const r = await fetch(`${TV_BOT_API_BASE}/db/collections/${encodeURIComponent(slug)}/react?key=${encodeURIComponent(TV_BOT_API_KEY)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: getReactionClientId(), emoji }),
      });
      const j = r.ok ? await r.json() : null;
      if(j?.ok) reactionCache[slug] = { counts: j.counts, mine: j.mine || [] };
      return j;
    }catch(e){
      console.warn(`[landing] react failed for ${slug}:`, e.message);
      return null;
    }
  }
  function reactionRowHtml(slug, expanded){
    const data = reactionCache[slug];
    const counts = (data && data !== 'pending') ? (data.counts || {}) : {};
    // jv: "yes i want multiple picks per person just not the same one
    // twice" -- mine is an array now (was a single value), any number of
    // distinct emojis this client has picked for this collection.
    const mine = (data && data !== 'pending') ? (data.mine || []) : [];
    const total = REACTION_EMOJI.reduce((sum, e) => sum + (counts[e] || 0), 0);
    // jv: "are we able to do just like a '+' sign that when clicked
    // brings up the emojis?" -- collapsed by default now: a single
    // toggle button (all of your own picks concatenated if you have any,
    // otherwise a plain +, with the total count alongside if anyone's
    // reacted at all) that reveals the full emoji row on tap instead of
    // always showing all four buttons up front. Stays open across a
    // re-render right after picking one (see the click handler below) --
    // now that more than one pick is allowed, collapsing after every
    // single tap would make picking a second one more annoying than it
    // needs to be.
    const mineLabel = mine.length ? mine.join('') : '+';
    return `<div class="landing-reactions" data-slug="${slug}" data-expanded="${expanded ? 'true' : 'false'}">
      <button type="button" class="landing-reaction-toggle" data-slug="${slug}" style="display:flex;align-items:center;gap:4px;padding:3px 8px;border-radius:999px;border:1px solid ${mine.length ? 'rgba(45,212,191,.7)' : 'rgba(255,255,255,.25)'};background:${mine.length ? 'rgba(45,212,191,.18)' : 'rgba(0,0,0,.4)'};color:#fff;font-size:12px;cursor:pointer;line-height:1">
        <span>${mineLabel}</span>${total > 0 ? `<span style="font-weight:700;font-size:10px">${total}</span>` : ''}
      </button>
      <div class="landing-reaction-options" style="display:${expanded ? 'flex' : 'none'};gap:4px;margin-top:4px">
        ${REACTION_EMOJI.map(e => {
          const count = counts[e] || 0;
          const isMine = mine.includes(e);
          return `<button type="button" class="landing-reaction-btn" data-slug="${slug}" data-emoji="${e}" style="display:flex;align-items:center;gap:3px;padding:2px 6px;border-radius:999px;border:1px solid ${isMine ? 'rgba(45,212,191,.7)' : 'rgba(255,255,255,.25)'};background:${isMine ? 'rgba(45,212,191,.18)' : 'rgba(0,0,0,.4)'};color:#fff;font-size:11px;cursor:pointer;line-height:1">
            <span>${e}</span>${count > 0 ? `<span style="font-weight:700">${count}</span>` : ''}
          </button>`;
        }).join('')}
      </div>
    </div>`;
  }
  document.addEventListener('click', async e => {
    const toggle = e.target.closest('.landing-reaction-toggle');
    if(toggle){
      e.preventDefault(); e.stopPropagation();
      const row = toggle.closest('.landing-reactions');
      const options = row?.querySelector('.landing-reaction-options');
      if(!row || !options) return;
      const expanded = row.dataset.expanded === 'true';
      // Collapse any other card's open picker first, so at most one is
      // open at a time -- avoids a page full of expanded emoji rows.
      document.querySelectorAll('.landing-reactions[data-expanded="true"]').forEach(r => {
        if(r !== row){ r.dataset.expanded = 'false'; const o = r.querySelector('.landing-reaction-options'); if(o) o.style.display = 'none'; }
      });
      row.dataset.expanded = expanded ? 'false' : 'true';
      options.style.display = expanded ? 'none' : 'flex';
      return;
    }
    const btn = e.target.closest('.landing-reaction-btn');
    if(!btn) return;
    e.preventDefault(); e.stopPropagation();
    const slug = btn.dataset.slug, emoji = btn.dataset.emoji;
    btn.style.opacity = '.5'; btn.disabled = true;
    const j = await postReaction(slug, emoji);
    const row = document.querySelector(`.landing-reactions[data-slug="${CSS.escape(slug)}"]`);
    if(row && j?.ok) row.outerHTML = reactionRowHtml(slug, true); // stays open -- may want to pick another
  });

  const FAQ_ITEMS = [
    {
      q: 'What is TraitView?',
      a: 'TraitView is a live trait explorer, rarity ranker, and marketplace tracker for NFT collections. It shows every token\'s traits, computed rarity rank, current OpenSea listing (if any), and recent sales history -- all kept up to date automatically, not a one-time snapshot.',
    },
    {
      q: 'What is TV Rank, and how is it calculated?',
      a: 'TV Rank (▲) is TraitView\'s own rarity ranking, computed directly from a collection\'s actual trait data -- separate from OS Rank (◆), which is whatever OpenSea itself reports. Every trait a token has is scored by how rare that exact trait value is across the whole collection (a value only 12 tokens share scores far higher than one shared by 4,000), and those per-trait scores are combined into one rarity score for the token. Rank #1 is the token with the highest combined score -- the rarest overall trait combination -- down to the most common. If a collection has published its own intended/theoretical trait odds (from how it was originally generated) rather than relying purely on what actually got minted, TraitView can rank against those instead for extra precision. Toggle between TV and OS rank anywhere you see the ▲/◆ icon.',
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
    { label: '/download', detail: 'Download a high-res PNG of any token' },
  ];
  const BOT_PILLS = ['Sales', 'Listings', 'Rank Filters', 'Trait Filters', 'Sweeps', 'Arbitrage', 'Personal Alerts', 'Portfolio'];

  const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let customizeMode = false;
  // Bumped at the start of every renderCollectionsGrid() call. wireSearch()
  // re-renders on every keystroke, replacing host.innerHTML entirely each
  // time -- without this guard, an older render's in-flight card-info/
  // floor fetch could resolve after a newer render already replaced the
  // grid, and blindly upgrading a card by slug could either double-apply
  // or, worse, silently miss an upgrade if timing lines up wrong. Each
  // render pass checks this against the generation it started with and
  // bails if a newer one has since begun.
  let renderGeneration = 0;
  let currentOrder = [];   // slugs, in display order
  let hiddenSet = new Set();
  let collectionInfoCache = {}; // slug -> {name, image_url, banner_image_url} | null
  let floorCache = {};          // slug -> {floor, symbol} | null

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
      // jv: nekoadz never shows a banner/avatar. The Worker's own endpoint
      // returns HTTP 200 even when OpenSea itself failed internally
      // (it wraps that as {ok:false, error:'OpenSea <status>'} rather than
      // a non-2xx response) -- so the !r.ok branch above can never catch
      // this specific failure mode, and until now nothing logged it either.
      // Exact same silent-failure gap already found and fixed once for
      // fetchFloor() below; closing the same gap here.
      if(!j?.ok){
        console.warn(`[landing] /os/collection-info?slug=${slug} came back ok:false -- raw response:`, JSON.stringify(j));
      }
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
      if(!r.ok){
        // jv: nekoadz showed no floor badge at all on the landing page,
        // despite the same /os/stats endpoint successfully returning a
        // floor when queried from the main app's own detail page for the
        // same slug. fetchCollectionInfo() already logs its own failures;
        // this one never did, which is exactly why nothing relevant showed
        // in the console when this was being diagnosed live.
        console.warn(`[landing] /os/stats?slug=${slug} returned ${r.status}`);
        floorCache[slug] = null;
        return null;
      }
      const j = await r.json();
      const t = j?.total || j?.stats || j || {};
      const floor = t.floor_price ?? j?.floor_price ?? null;
      // jv: collection cards need to be multi-chain aware -- a non-ETH
      // collection's floor (e.g. Nekoadz on Robinhood Chain, denominated
      // in USDG) must never be silently mislabeled as ETH. Reading the
      // real symbol here so floorBadgeHtml() below can show it correctly,
      // same fix already applied to the main app's own floor display
      // (fetchFloor() in app.js).
      const symbol = t.floor_price_symbol ?? j?.floor_price_symbol ?? 'ETH';
      if((floor == null || !(floor > 0))){
        console.warn(`[landing] /os/stats?slug=${slug} returned ok but no usable floor_price -- raw response:`, JSON.stringify(j));
      }
      floorCache[slug] = (typeof floor === 'number' && floor > 0) ? { floor, symbol } : null;
      return floorCache[slug];
    }catch(e){
      console.warn(`[landing] /os/stats?slug=${slug} fetch failed:`, e.message);
      floorCache[slug] = null;
      return null;
    }
  }

  function floorBadgeHtml(floorInfo){
    if(!floorInfo) return '';
    const { floor, symbol } = floorInfo;
    const display = floor >= 1 ? floor.toFixed(2) : floor.toFixed(4);
    const prefix = ['ETH','WETH'].includes(symbol) ? 'Ξ ' : '';
    return `<span class="landing-floor-badge">${prefix}${display} ${symbol} <span style="opacity:.7;font-weight:500">floor</span></span>`;
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
            <div style="min-width:0">
              <div style="font-weight:700;font-size:15px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6);line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}${isFav ? ' ★' : ''}</div>
              <div style="font-size:11px;font-weight:600;text-shadow:0 1px 3px rgba(0,0,0,.6)">${chainBadgeHtml(entry.chain)}</div>
            </div>
          </div>
          ${floorBadgeHtml(floor)}
        </a>
        <!-- jv: reactions need their own absolutely-positioned slot with a
             z-index above the full-card <a> overlay right above (same
             reasoning as the "•••" menu button at the top -- a sibling
             positioned on top of the <a>, not a descendant of it, so
             clicking it hits the button itself and never triggers the
             card's own navigate-to-collection click at all). Top-left,
             the one corner nothing else here already uses (menu button
             is top-right; name/avatar and floor badge are both anchored
             to the bottom via the <a> overlay's own flex layout). -->
        <div style="position:absolute;top:10px;left:10px;z-index:2">${customizeMode ? '' : reactionRowHtml(slug)}</div>
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
    const myGeneration = ++renderGeneration;
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
    //
    // jv: "OCAS doesn't always display the floor." Every collection's
    // fetchCollectionInfo+fetchFloor pair used to fire in one single
    // Promise.all across the whole visible list -- with even a handful of
    // collections that's a burst of many simultaneous requests hitting
    // OpenSea (via the Worker) at once, on every page load where the
    // Worker's own 1-hour cache hasn't warmed yet. An intermittent OpenSea
    // rate-limit response on any one of those would explain exactly this
    // symptom: sometimes fine, sometimes not, no pattern tied to the
    // collection itself. Processing in small batches with a short gap
    // between them keeps the "cards fill in progressively" behavior
    // while meaningfully cutting how many requests can land on OpenSea in
    // the same instant.
    const BATCH_SIZE = 3;
    const BATCH_GAP_MS = 150;
    for(let i = 0; i < visible.length; i += BATCH_SIZE){
      if(myGeneration !== renderGeneration) return; // a newer render has since replaced this grid
      const batch = visible.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(async slug => {
        const [info, floor] = await Promise.all([fetchCollectionInfo(slug), fetchFloor(slug), fetchReactionData(slug)]);
        if(myGeneration !== renderGeneration) return;
        const card = host.querySelector(`.landing-card[data-slug="${CSS.escape(slug)}"]`);
        if(card) card.outerHTML = collectionCardHtml(slug, COLLECTIONS[slug] || { name: slug }, info, floor);
      }));
      if(i + BATCH_SIZE < visible.length) await new Promise(r => setTimeout(r, BATCH_GAP_MS));
    }
    if(myGeneration !== renderGeneration) return;
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
        // jv confirmed live: dragging worked visually but never actually
        // reordered anything. Root cause -- the dragged card is
        // transformed to visually follow the pointer, so
        // document.elementFromPoint() (used below to detect which
        // sibling the pointer is currently over) was hitting the dragged
        // card ITSELF every time, since it's now visually sitting right
        // at the pointer's position -- overCard !== dragEl silently
        // failed on every single move, so the swap logic never ran.
        // pointer-events:none makes the dragged card transparent to hit-
        // testing while it's held, so elementFromPoint correctly "sees
        // through" it to whatever's actually underneath.
        card.style.pointerEvents = 'none';
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
          dragEl.style.pointerEvents = '';
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
