/* TraitView landing page.
   Only does anything when window.__TV_LANDING__ is true (set by the inline
   script at the top of <head> for a bare traitview.com visit with no
   ?collection=, ?jump=/?token=, or /token/:slug/:id in the URL).
   Classic script, loaded after config.js so COLLECTIONS/loadDynamicCollections
   are available. */

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
      a: 'Yes -- collections get added through the bot\'s own onboarding flow. Once a collection is backfilled, it automatically shows up here on the landing page and in the collection switcher, no separate setup needed on the TraitView side.',
    },
    {
      q: 'Is the listing/sales data live?',
      a: 'Yes. Listings and sales are synced continuously (not fetched once and cached forever), so prices, floor, and volume reflect the current market rather than a stale snapshot from whenever the page first loaded.',
    },
    {
      q: 'Why was this built?',
      a: 'TraitView started as a tool for the On-Chain All Stars community specifically, and grew from there into something built for other collections too. It\'s a side project, kept up because it\'s genuinely useful -- not a commercial product.',
    },
  ];

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

  async function fetchCollectionInfo(slug){
    try{
      const r = await fetch(`${LIVE_ENDPOINT}/os/collection-info?slug=${encodeURIComponent(slug)}`, { cache:'no-store' });
      if(!r.ok) return null;
      const j = await r.json();
      return j?.ok ? j : null;
    }catch(_){ return null; }
  }

  function collectionCardHtml(slug, entry, info){
    const name = info?.name || entry.name || slug;
    const banner = info?.banner_image_url;
    const avatar = info?.image_url;
    const bannerStyle = banner
      ? `background-image:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.55)),url('${banner.replace(/'/g,"%27")}');background-size:cover;background-position:center`
      : 'background:var(--soft)';
    return `
      <a href="?collection=${encodeURIComponent(slug)}" class="landing-card" data-slug="${slug}"
         style="display:block;border-radius:14px;overflow:hidden;border:1px solid var(--border);text-decoration:none;color:var(--text);position:relative;height:150px;${bannerStyle}">
        <div style="position:absolute;inset:0;display:flex;align-items:flex-end;padding:14px;gap:10px">
          ${avatar ? `<img src="${avatar}" alt="" style="width:44px;height:44px;border-radius:10px;border:2px solid rgba(255,255,255,.85);object-fit:cover;flex-shrink:0">` : ''}
          <div style="font-weight:700;font-size:15px;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.6);line-height:1.25">${name}</div>
        </div>
      </a>
    `;
  }

  async function renderCollectionsGrid(){
    const host = document.getElementById('landingCollectionsGrid');
    if(!host) return;
    // loadDynamicCollections() merges any onboarded collection into
    // COLLECTIONS beyond the hardcoded OCAS/Argonauts baseline -- wait for
    // it so a newly-added collection (like nekoadz) shows up here too,
    // not just after a manual switcher refresh.
    if(typeof loadDynamicCollections === 'function'){
      try{ await loadDynamicCollections(); }catch(_){}
    }
    const slugs = Object.keys(COLLECTIONS);
    if(!slugs.length){
      host.innerHTML = '<div style="grid-column:1/-1;color:var(--sub);font-size:13px;text-align:center">No collections found.</div>';
      return;
    }
    // Show cards immediately with just the name (no banner/avatar yet),
    // then upgrade each one in place as its OpenSea info arrives --
    // avoids the whole grid waiting on the slowest fetch before anything
    // is visible at all.
    host.innerHTML = slugs.map(slug => collectionCardHtml(slug, COLLECTIONS[slug], null)).join('');
    await Promise.all(slugs.map(async slug => {
      const info = await fetchCollectionInfo(slug);
      if(!info) return;
      const card = host.querySelector(`.landing-card[data-slug="${CSS.escape(slug)}"]`);
      if(card) card.outerHTML = collectionCardHtml(slug, COLLECTIONS[slug], info);
    }));
  }

  renderFaq();
  setTwitterLink();
  renderCollectionsGrid();
}
