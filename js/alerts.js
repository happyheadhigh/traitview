/* TraitView alerts (push notifications) -- the 🔔 flow.
   jv: "push notifications should work just like the discord bot. Maybe
   adding an 🔔 ... that brings up the option for ... listing alerts,
   trait, trait counts ... Nice guided flow to set it up. Or even an alert
   for newly minted tokens, or burns". First build (jv's picks): new
   listings under a price (any token / a trait / a trait count), new mints,
   burns (OCAS -- the only collection with a burn mechanic).
   Backend: bot lib/push.js + /push/* endpoints on the collection's API.
   No accounts: this device's push subscription is its identity. */
(function(){
  const S = { step: 'home', draft: {}, pubKey: null, sub: null, rules: null, error: null, busy: false, tab: null, inbox: null };
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isInstalled = () => (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const colName = () => (typeof COLLECTIONS !== 'undefined' && COLLECTIONS[LIVE_SLUG]?.name) || LIVE_SLUG;
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  async function api(method, path, body, query){
    const qs = new URLSearchParams({ key: RAILWAY_KEY, ...(query || {}) });
    const r = await fetch(`${RAILWAY_API}${path}?${qs}`, {
      method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });
    if(r.status === 404) throw new Error('unavailable');
    const j = await r.json().catch(() => ({}));
    if(!r.ok || j.ok === false) throw new Error(j.error || `HTTP ${r.status}`);
    return j;
  }
  function urlB64ToUint8(b64){
    const pad = '='.repeat((4 - b64.length % 4) % 4);
    const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  }
  async function currentSub(){
    if(!pushSupported()) return null;
    const reg = await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }
  async function loadState(){
    S.error = null;
    try{
      const [k, sub] = await Promise.all([api('GET', '/push/public-key').then(j => j.key), currentSub()]);
      S.pubKey = k; S.sub = sub;
      S.rules = sub ? (await api('GET', '/push/rules', null, { endpoint: sub.endpoint })).rules : [];
      S.inbox = sub ? ((await api('GET', '/push/inbox', null, { endpoint: sub.endpoint }).catch(() => null))?.items || []) : [];
      if(S.tab == null) S.tab = S.inbox.length ? 'activity' : 'alerts';
      // opening the bell = everything in the feed has been seen
      if(sub && S.inbox.length) api('POST', '/push/inbox/seen', { endpoint: sub.endpoint }).then(() => setBadge(0)).catch(() => {});
    }catch(e){ S.error = e.message === 'unavailable' ? 'unavailable' : e.message; }
    render();
  }

  const shortA = a => a ? `${String(a).slice(0, 6)}…${String(a).slice(-4)}` : '';
  function ruleText(r){
    const name = esc(r.collection_name || r.collection_slug);
    if(r.kind === 'mint') return `New mints · ${name}`;
    if(r.kind === 'burn') return `Burns · ${name}`;
    if(r.kind === 'wallet') return `Wallet ${esc(shortA(r.wallet_address))} · buys, sells, mints &amp; transfers · ${name}`;
    if(r.kind === 'floor') return `Floor ${r.direction === 'above' ? 'rises above' : 'drops below'} Ξ${Number(r.threshold_eth)} · ${name}`;
    const scope = r.scope === 'trait' ? `${esc(r.trait_name)}: ${esc(r.trait_value)}`
      : r.scope === 'traitcount' ? `${r.trait_count} trait${Number(r.trait_count) === 1 ? '' : 's'}`
      : r.scope === 'token' ? `Token #${esc(r.token_id)}` : 'Any token';
    if(r.kind === 'sale') return `Sales · ${scope} · ${name}`;
    const price = r.max_price_eth != null ? ` under Ξ${Number(r.max_price_eth)}` : '';
    return `New listing${price} · ${scope} · ${name}`;
  }

  // ── rendering ──────────────────────────────────────────────────────────
  // jv: "I don't like the emojis... the web app/page should look a little more
  // professional... minimalistic, like the alert one we added." Outline icons
  // in the bell's style; stroke follows the theme's text color.
  const _IC = {
    floor:   '<polyline points="22 17 13.5 8.5 8.5 13.5 2 7"/><polyline points="16 17 22 17 22 11"/>',
    listing: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
    sale:    '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    mint:    '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M17 5h4"/>',
    burn:    '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    any:     '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    trait:   '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    count:   '<line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>',
    token:   '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
    wallet:  '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><circle cx="16" cy="14" r="1.2"/>',
  };
  const icon = k => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${_IC[k] || ''}</svg>`;
  function card(icon, title, sub, action){
    return `<button type="button" class="tva-card" data-act="${action}"><span class="tva-card-ic">${icon}</span><span class="tva-card-tx"><b>${title}</b>${sub ? `<span>${sub}</span>` : ''}</span><span class="tva-chev">›</span></button>`;
  }
  function body(){
    if(!pushSupported()){
      if(isIOS && !isInstalled()) return `<div class="tva-note"><b>Install TraitView first.</b><br>On iPhone, notifications only work from the installed app (iOS 16.4 or later). Add it to your home screen, open it from there, then tap the bell again.</div>
        <button type="button" class="tva-primary" data-act="install">Install TraitView</button>`;
      return `<div class="tva-note">This browser doesn't support notifications.${isIOS ? ' Update to iOS 16.4 or later.' : ''}</div>`;
    }
    if(S.error === 'unavailable') return `<div class="tva-note">Alerts aren't available for ${esc(colName())} yet.</div>`;
    if(S.error) return `<div class="tva-note">Couldn't load alerts (${esc(S.error)}). <button type="button" class="tva-link" data-act="retry">Try again</button></div>`;
    if(S.rules == null) return `<div class="tva-note">Loading…</div>`;
    const d = S.draft;
    switch(S.step){
      case 'type':
        return `<div class="tva-q">What should we alert you about?</div>`
          + card(icon('floor'), 'Floor price', 'When it drops below or rises above a price', 'type:floor')
          + card(icon('listing'), 'New listing', 'Traits, trait counts or a token #', 'type:listing')
          + card(icon('sale'), 'Sale', 'When a trait, trait count or token # sells', 'type:sale')
          + card(icon('wallet'), 'Wallet', 'When a wallet buys, sells, mints or moves tokens', 'type:wallet')
          + card(icon('mint'), 'New mint', `New ${esc(colName())} tokens`, 'type:mint')
          // Burns only exist for collections with a burn mechanic (OCAS).
          + (LIVE_SLUG === 'on-chain-all-stars' ? card(icon('burn'), 'Burn', 'Whenever a token is burned', 'type:burn') : '')
          + `<button type="button" class="tva-link tva-back" data-act="home">‹ Back</button>`;
      case 'tokentype':
        return `<div class="tva-q">Alert me about #${esc(d.tokenId)} when it…</div>`
          + card(icon('listing'), 'Gets listed', 'Any price, or under a price you choose', 'tok:listing')
          + card(icon('sale'), 'Sells', 'Whenever it sells', 'tok:sale');
      case 'wallet':
        return `<div class="tva-q">Which wallet?</div>
          <label class="tva-field">Wallet address<input data-in="wallet" type="text" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="0x…" value="${esc(d.wallet ?? '')}"></label>
          <div class="tva-hint">You'll get a notification when it buys, sells, mints, receives, sends or burns ${esc(colName())}. Tapping it opens that wallet's history.</div>
          <button type="button" class="tva-primary" data-act="after-wallet">Next</button>
          <button type="button" class="tva-link tva-back" data-act="type">‹ Back</button>`;
      case 'tokenid':
        return `<div class="tva-q">Which token?</div>
          <label class="tva-field">Token #<input data-in="tokenId" type="number" inputmode="numeric" min="0" step="1" placeholder="e.g. 1234" value="${esc(d.tokenId ?? '')}"></label>
          <button type="button" class="tva-primary" data-act="after-scope">Next</button>
          <button type="button" class="tva-link tva-back" data-act="scope">‹ Back</button>`;
      case 'scope':
        return `<div class="tva-q">${d.kind === 'sale' ? 'Which sales?' : 'Which listings?'}</div>`
          + card(icon('any'), 'Any token', '', 'scope:any')
          + card(icon('trait'), 'A trait', 'e.g. Cloak: Ivory', 'scope:trait')
          + card(icon('count'), 'A trait count', 'e.g. 3 traits', 'scope:traitcount')
          + card(icon('token'), 'A token #', 'One specific token', 'scope:token')
          + `<button type="button" class="tva-link tva-back" data-act="type">‹ Back</button>`;
      case 'trait': {
        const dom = (typeof TRAIT_DOMAIN !== 'undefined' && TRAIT_DOMAIN) || {};
        const cats = Object.keys(dom).sort();
        const cat = d.traitName && dom[d.traitName] ? d.traitName : cats[0];
        const vals = cat ? [...dom[cat]].map(String).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];
        return `<div class="tva-q">Which trait?</div>
          <label class="tva-field">Category<select data-in="traitName">${cats.map(c => `<option${c === cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>
          <label class="tva-field">Value<select data-in="traitValue">${vals.map(v => `<option${v === d.traitValue ? ' selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
          <button type="button" class="tva-primary" data-act="after-scope">Next</button>
          <button type="button" class="tva-link tva-back" data-act="scope">‹ Back</button>`;
      }
      case 'count': {
        const counts = (window._tvTraitCounts && window._tvTraitCounts.length) ? window._tvTraitCounts : [0,1,2,3,4,5,6,7,8];
        return `<div class="tva-q">How many traits?</div>
          <label class="tva-field">Trait count<select data-in="traitCount">${counts.map(c => `<option value="${c}"${String(c) === String(d.traitCount) ? ' selected' : ''}>${c} trait${c === 1 ? '' : 's'}</option>`).join('')}</select></label>
          <button type="button" class="tva-primary" data-act="after-scope">Next</button>
          <button type="button" class="tva-link tva-back" data-act="scope">‹ Back</button>`;
      }
      case 'price': {
        const floor = Number(window._lastFloorEth || 0);
        return `<div class="tva-q">Alert me when it's listed under…</div>
          <label class="tva-field">Max price (Ξ)<input data-in="maxPriceEth" type="number" inputmode="decimal" min="0" step="0.001" placeholder="Any price" value="${esc(d.maxPriceEth ?? '')}"></label>
          <div class="tva-hint">Leave empty to be alerted for every new listing.${floor ? ` Floor is Ξ${floor.toFixed(4).replace(/\.?0+$/,'')}.` : ''}</div>
          <button type="button" class="tva-primary" data-act="confirm">Next</button>
          <button type="button" class="tva-link tva-back" data-act="${d.fromToken ? 'tokentype' : d.scope === 'trait' ? 'trait' : d.scope === 'traitcount' ? 'count' : d.scope === 'token' ? 'tokenid' : 'scope'}">‹ Back</button>`;
      }
      case 'floor': {
        // jv: "Yes I want floor alerts as well" -- threshold it crosses.
        const floor = Number(window._lastFloorEth || 0);
        const dir = d.direction || 'below';
        return `<div class="tva-q">Alert me when the floor…</div>
          <label class="tva-field">Direction<select data-in="direction">
            <option value="below"${dir === 'below' ? ' selected' : ''}>Drops below</option>
            <option value="above"${dir === 'above' ? ' selected' : ''}>Rises above</option></select></label>
          <label class="tva-field">Price (Ξ)<input data-in="thresholdEth" type="number" inputmode="decimal" min="0" step="0.001" placeholder="${floor ? floor.toFixed(3) : '0.5'}" value="${esc(d.thresholdEth ?? '')}"></label>
          <div class="tva-hint">${floor ? `Floor is Ξ${floor.toFixed(4).replace(/\.?0+$/,'')} right now. ` : ''}You'll get one notification when it crosses your price.</div>
          <button type="button" class="tva-primary" data-act="confirm-floor">Next</button>
          <button type="button" class="tva-link tva-back" data-act="type">‹ Back</button>`;
      }
      case 'confirm': {
        const preview = ruleText({ kind: d.kind, scope: d.scope, wallet_address: d.wallet, trait_name: d.traitName, trait_value: d.traitValue, trait_count: d.traitCount, token_id: d.tokenId,
          direction: d.direction, threshold_eth: d.thresholdEth,
          max_price_eth: d.maxPriceEth === '' || d.maxPriceEth == null ? null : d.maxPriceEth, collection_name: colName() });
        const needsPerm = !S.sub || Notification.permission !== 'granted';
        return `<div class="tva-q">Your alert</div><div class="tva-summary">${preview}</div>
          <button type="button" class="tva-primary" data-act="save" ${S.busy ? 'disabled' : ''}>${S.busy ? 'Saving…' : needsPerm ? 'Turn on notifications & save' : 'Save alert'}</button>
          ${Notification.permission === 'denied' ? `<div class="tva-hint">Notifications are blocked for TraitView. Allow them in your ${isIOS ? 'iPhone Settings → Notifications → TraitView' : 'browser site settings'}, then try again.</div>` : ''}
          <button type="button" class="tva-link tva-back" data-act="${d.kind === 'wallet' ? (d.fromWatch ? 'home' : 'wallet') : d.fromToken && d.kind === 'sale' ? 'tokentype' : d.kind === 'listing' ? 'price' : d.kind === 'floor' ? 'floor' : d.kind === 'sale' ? (d.scope === 'trait' ? 'trait' : d.scope === 'traitcount' ? 'count' : d.scope === 'token' ? 'tokenid' : 'scope') : 'type'}">‹ Back</button>`;
      }
      default: {
        // jv (Activity Inbox): the bell opens a feed of everything this
        // device was notified about; tap an entry to jump straight there.
        const tabs = `<div class="tva-tabs"><button type="button" class="tva-tab${S.tab === 'activity' ? ' on' : ''}" data-act="tab:activity">Activity</button><button type="button" class="tva-tab${S.tab !== 'activity' ? ' on' : ''}" data-act="tab:alerts">My alerts${(S.rules || []).length ? ` (${S.rules.length})` : ''}</button></div>`;
        if(S.tab === 'activity'){
          const items = S.inbox || [];
          const kindIc = { wallet:'wallet', sale:'sale', listing:'listing', floor:'floor', mint:'mint', burn:'burn' };
          const ago = ts => { const m = Math.max(0, Math.round((Date.now() / 1000 - Number(ts)) / 60)); return m < 1 ? 'now' : m < 60 ? m + 'm' : m < 1440 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd'; };
          const kindLabel = { wallet:'Wallet activity', sale:'Sale', listing:'Listing', floor:'Floor', mint:'Mint', burn:'Burn' };
          const feed = items.map((it, i) => `<button type="button" class="tva-feed" data-act="open:${i}"><span class="tva-card-ic">${icon(kindIc[it.kind] || 'token')}</span><span class="tva-card-tx"><em>${esc(kindLabel[it.kind] || 'Alert')} · ${ago(it.ts)}</em><b>${esc(it.title)}</b>${it.body ? `<span>${esc(it.body)}</span>` : ''}</span><span class="tva-chev">›</span></button>`).join('');
          return tabs + (feed || `<div class="tva-note">Nothing yet. When your alerts fire, they'll collect here so you can come back to them.</div>`)
            + (items.length ? `<button type="button" class="tva-link" data-act="clear-inbox">Clear activity</button>` : '')
            + (S.flash ? `<div class="tva-flash">${esc(S.flash)}</div>` : '');
        }
        const list = (S.rules || []).map(r => `<div class="tva-rule"><span>${ruleText(r)}</span><button type="button" class="tva-x" data-act="del:${r.id}" aria-label="Delete alert">✕</button></div>`).join('');
        return tabs + (list ? `${list}` : `<div class="tva-note">No alerts yet. Get a notification when something you care about happens in ${esc(colName())}.</div>`)
          + `<button type="button" class="tva-primary" data-act="type">+ New alert</button>`
          + (S.sub && (S.rules || []).length ? `<button type="button" class="tva-link" data-act="test">Send a test notification</button>` : '')
          + (S.flash ? `<div class="tva-flash">${esc(S.flash)}</div>` : '');
      }
    }
  }
  function render(){
    const sh = document.getElementById('tvAlertsSheet');
    if(!sh) return;
    sh.querySelector('.tva-body').innerHTML = body();
    sh.querySelector('.tva-title').textContent = `Alerts · ${colName()}`;
  }

  // ── actions ────────────────────────────────────────────────────────────
  async function save(){
    const d = S.draft;
    // Ask for permission FIRST, synchronously inside the tap: iPhone only
    // shows the prompt from a direct user gesture.
    const permP = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
    S.busy = true; render();
    try{
      if(await permP !== 'granted') throw new Error('Notifications were not allowed.');
      if(!S.pubKey) S.pubKey = (await api('GET', '/push/public-key')).key;
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if(!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8(S.pubKey) });
      await api('POST', '/push/subscribe', { subscription: sub.toJSON(), userAgent: navigator.userAgent });
      S.sub = sub;
      const excluded = (typeof COLLECTIONS !== 'undefined' && COLLECTIONS[LIVE_SLUG]?.nonWornTraitCategories) || [];
      await api('POST', '/push/rules', { endpoint: sub.endpoint, slug: LIVE_SLUG, collectionName: colName(), kind: d.kind, scope: d.scope || 'any',
        traitName: d.traitName, traitValue: d.traitValue, traitCount: d.traitCount, tokenId: d.tokenId, excludedCategories: excluded,
        maxPriceEth: d.maxPriceEth === '' ? null : d.maxPriceEth, direction: d.direction || 'below', thresholdEth: d.thresholdEth, wallet: d.wallet });
      S.rules = (await api('GET', '/push/rules', null, { endpoint: sub.endpoint })).rules;
      S.flash = d.kind === 'wallet' ? 'Watching wallet ✓' : 'Alert saved ✓'; S.step = 'home'; S.tab = 'alerts'; S.draft = {};
    }catch(e){ S.flash = e.message; S.step = 'home'; }
    S.busy = false; render();
    setTimeout(() => { S.flash = null; render(); }, 3500);
  }
  function onClick(e){
    const b = e.target.closest('[data-act]'); if(!b) return;
    const act = b.dataset.act, d = S.draft;
    const readInputs = () => document.querySelectorAll('#tvAlertsSheet [data-in]').forEach(el => { d[el.dataset.in] = el.value; });
    readInputs();
    if(act.startsWith('tab:')){ S.tab = act.slice(4); S.step = 'home'; render(); return; }
    if(act.startsWith('open:')){
      const it = (S.inbox || [])[+act.slice(5)];
      if(it && it.url){ close(); tvOpenAlertUrl(it.url); }
      return;
    }
    if(act === 'clear-inbox'){
      api('DELETE', '/push/inbox', null, { endpoint: S.sub?.endpoint }).then(() => { S.inbox = []; render(); }).catch(err => { S.flash = err.message; render(); });
      return;
    }
    if(act.startsWith('tok:')){ d.kind = act.slice(4); d.scope = 'token'; S.step = d.kind === 'listing' ? 'price' : 'confirm'; render(); return; }
    if(act === 'tokentype'){ S.step = 'tokentype'; render(); return; }
    if(act === 'after-wallet'){
      const w = String(d.wallet || '').trim();
      if(!/^0x[0-9a-fA-F]{40}$/.test(w)){ const inp = document.querySelector('#tvAlertsSheet [data-in="wallet"]'); if(inp){ inp.focus(); inp.style.outline = '2px solid var(--tc-f87171)'; } return; }
      d.wallet = w.toLowerCase(); S.step = 'confirm'; render(); return;
    }
    if(act === 'wallet'){ S.step = 'wallet'; render(); return; }
    if(act === 'install'){ close(); if(typeof tvInstallApp === 'function') tvInstallApp(); return; }
    if(act === 'retry'){ S.rules = null; render(); loadState(); return; }
    if(act === 'home' || act === 'type' || act === 'scope' || act === 'trait' || act === 'price' || act === 'confirm'){
      if(act === 'price' && d.scope === 'traitcount') d.traitCount = d.traitCount ?? document.querySelector('#tvAlertsSheet [data-in="traitCount"]')?.value;
      S.step = act; render(); return;
    }
    if(act === 'count'){ S.step = 'count'; render(); return; }
    if(act === 'tokenid'){ S.step = 'tokenid'; render(); return; }
    // after choosing trait / count / token #: listings go on to a price; sales are done
    if(act === 'after-scope'){
      if(d.scope === 'traitcount') d.traitCount = d.traitCount ?? document.querySelector('#tvAlertsSheet [data-in="traitCount"]')?.value;
      if(d.scope === 'token' && !(parseInt(d.tokenId, 10) >= 0)){ const inp = document.querySelector('#tvAlertsSheet [data-in="tokenId"]'); if(inp){ inp.focus(); inp.style.outline = '2px solid var(--tc-f87171)'; } return; }
      S.step = d.kind === 'listing' ? 'price' : 'confirm'; render(); return;
    }
    if(act.startsWith('type:')){ S.draft = { kind: act.slice(5) }; S.step = (S.draft.kind === 'listing' || S.draft.kind === 'sale') ? 'scope' : S.draft.kind === 'floor' ? 'floor' : S.draft.kind === 'wallet' ? 'wallet' : 'confirm'; render(); return; }
    if(act === 'floor'){ S.step = 'floor'; render(); return; }
    if(act === 'confirm-floor'){
      if(!(Number(d.thresholdEth) > 0)){ S.flash = null; const inp = document.querySelector('#tvAlertsSheet [data-in="thresholdEth"]'); if(inp){ inp.focus(); inp.style.outline = '2px solid var(--tc-f87171)'; } return; }
      S.step = 'confirm'; render(); return;
    }
    if(act.startsWith('scope:')){ d.scope = act.slice(6); S.step = d.scope === 'trait' ? 'trait' : d.scope === 'traitcount' ? 'count' : d.scope === 'token' ? 'tokenid' : (d.kind === 'listing' ? 'price' : 'confirm'); render(); return; }
    if(act === 'save'){ save(); return; }
    if(act === 'test'){ api('POST', '/push/test', { endpoint: S.sub?.endpoint }).then(() => { S.flash = 'Test sent — check your notifications'; render(); }).catch(err => { S.flash = err.message; render(); }); return; }
    if(act.startsWith('del:')){
      const id = act.slice(4);
      api('DELETE', `/push/rules/${id}`, null, { endpoint: S.sub?.endpoint }).then(() => { S.rules = S.rules.filter(r => String(r.id) !== id); render(); }).catch(err => { S.flash = err.message; render(); });
    }
  }
  function onChange(e){
    const el = e.target.closest('[data-in]'); if(!el) return;
    S.draft[el.dataset.in] = el.value;
    if(el.dataset.in === 'traitName'){ S.draft.traitValue = undefined; render(); }
  }

  function close(){
    document.getElementById('tvAlertsSheet')?.classList.remove('open');
    document.getElementById('tvAlertsOverlay')?.classList.remove('open');
  }
  // Unread dot on the bell(s)
  function setBadge(n){
    ['mobileAlertsBtn', 'desktopAlertsBtn'].forEach(id => {
      const b = document.getElementById(id); if(!b) return;
      let dot = b.querySelector('.tva-badge');
      if(n > 0){
        if(!dot){ dot = document.createElement('span'); dot.className = 'tva-badge'; b.appendChild(dot); }
        dot.textContent = n > 9 ? '9+' : String(n);
      } else dot?.remove();
    });
  }
  async function refreshBadge(){
    try{
      if(!pushSupported() || typeof RAILWAY_API === 'undefined') return;
      const sub = await currentSub(); if(!sub) return setBadge(0);
      const j = await api('GET', '/push/inbox', null, { endpoint: sub.endpoint });
      setBadge(j.unread || 0);
    }catch(_){ }
  }
  window.tvRefreshAlertBadge = refreshBadge;
  setTimeout(refreshBadge, 3000);
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') refreshBadge(); });
  // Open an inbox entry: same collection -> jump in place; else load it.
  window.tvOpenAlertUrl = function(url){
    let u; try{ u = new URL(url, location.origin); }catch(_){ return; }
    const slug = u.searchParams.get('collection');
    if(slug && typeof LIVE_SLUG !== 'undefined' && slug === LIVE_SLUG){
      const w = u.searchParams.get('whist'), tok = u.searchParams.get('token') || u.searchParams.get('wtoken');
      if(w && typeof tvOpenWalletHistory === 'function'){ tvOpenWalletHistory(w, tok ? +tok : null); return; }
      if(tok && typeof openModal === 'function'){ openModal(+tok); return; }
    }
    location.href = u.href;
  };
  // jv: bell in each token modal -> "listed" or "sells" alert for that token #.
  window.tvWatchToken = function(id){
    if(!(Number(id) >= 0)) return;
    window.openAlerts({ step: 'tokentype', draft: { tokenId: Number(id), scope: 'token', fromToken: true } });
  };
  // jv: "Watch wallet" -- one tap from Wallet View straight to the confirm step.
  window.tvWatchWallet = function(addr){
    addr = String(addr || '').trim();
    if(!/^0x[0-9a-fA-F]{40}$/.test(addr)) return;
    window.openAlerts({ step: 'confirm', draft: { kind: 'wallet', wallet: addr.toLowerCase(), fromWatch: true } });
  };
  window.openAlerts = function(opts){
    document.getElementById('mobileMenu')?.classList.remove('open');
    let ov = document.getElementById('tvAlertsOverlay'), sh = document.getElementById('tvAlertsSheet');
    if(!sh){
      ov = document.createElement('div'); ov.id = 'tvAlertsOverlay'; ov.addEventListener('click', close);
      sh = document.createElement('div'); sh.id = 'tvAlertsSheet'; sh.setAttribute('role', 'dialog');
      sh.innerHTML = `<div class="tva-head"><span class="tva-title"></span><button type="button" class="tva-close" aria-label="Close">✕</button></div><div class="tva-body"></div>`;
      sh.querySelector('.tva-close').addEventListener('click', close);
      sh.addEventListener('click', onClick);
      sh.addEventListener('change', onChange);
      document.body.appendChild(ov); document.body.appendChild(sh);
    }
    S.step = opts?.step || 'home'; S.draft = opts?.draft || {}; S.flash = null; S.rules = null; S.tab = null;
    render();
    requestAnimationFrame(() => { ov.classList.add('open'); sh.classList.add('open'); });
    if(pushSupported()) loadState();   // also prefetches the key before any Save tap
  };
  document.addEventListener('keydown', e => { if(e.key === 'Escape') close(); });
})();

/* ── Tap inspector (debug; only with ?tapdebug=1) ────────────────────────
   jv: the fullscreen 'Show images' bar doesn't respond on a real iPhone in
   landscape ("It thinks I'm tapping the lowest dot") but every simulated
   test passes. This shows, on the phone itself, what each tap actually
   lands on and which chart events fire, so the cause can be seen directly.
   Off unless the URL has ?tapdebug=1. */
(function(){
  // Also switchable inside the installed app (no address bar there): type
  // 'tapdebug' into the Sale Chart wallet search box (see app.js). The
  // choice is remembered in this app's storage.
  window.tvToggleTapDebug = function(){
    let on = false; try{ on = localStorage.getItem('tvTapDebug') === '1'; }catch(_){}
    try{ localStorage.setItem('tvTapDebug', on ? '0' : '1'); }catch(_){}
    location.reload();
  };
  let stored = false; try{ stored = localStorage.getItem('tvTapDebug') === '1'; }catch(_){}
  if(new URLSearchParams(location.search).get('tapdebug') !== '1' && !stored) return;
  const box = document.createElement('div');
  box.id = 'tvTapDebug';
  box.style.cssText = 'position:fixed;top:4px;left:4px;z-index:2147483647;max-width:60vw;max-height:45vh;overflow:auto;background:rgba(0,0,0,.82);color:#9f9;font:10px/1.35 ui-monospace,monospace;padding:6px 8px;border-radius:8px;pointer-events:none;white-space:pre-wrap';
  const lines = [];
  const log = msg => { lines.push(new Date().toISOString().slice(17, 23) + ' ' + msg); while(lines.length > 18) lines.shift(); box.textContent = lines.join('\n'); };
  const desc = el => {
    if(!el) return 'null';
    const cls = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '';
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
  };
  const start = () => {
    document.body.appendChild(box);
    log(`tapdebug on · ${innerWidth}x${innerHeight} · ${screen.orientation ? screen.orientation.type : ''}`);
    ['touchstart', 'touchend', 'click'].forEach(type => document.addEventListener(type, e => {
      const pt = e.changedTouches ? e.changedTouches[0] : e;
      const hit = document.elementFromPoint(pt.clientX, pt.clientY);
      log(`${type} @${Math.round(pt.clientX)},${Math.round(pt.clientY)} target=${desc(e.target)} hit=${desc(hit)}`);
    }, true));
    const hook = () => {
      const h = document.getElementById('chartFullscreenHost');
      if(!h || typeof h.on !== 'function' || h._tvDbg) return;
      h._tvDbg = true;
      h.on('plotly_click', d => log(`plotly_click #${d?.points?.[0]?.customdata?.id} (event @${Math.round(d?.event?.clientX||0)},${Math.round(d?.event?.clientY||0)})`));
      h.on('plotly_hover', d => log(`plotly_hover #${d?.points?.[0]?.customdata?.id}`));
    };
    setInterval(() => { const h = document.getElementById('chartFullscreenHost'); if(h && !h._tvDbg && h._fullLayout) hook(); if(h && h._tvDbg && !h._fullLayout) h._tvDbg = false; }, 1000);
    const og = window._scgCollapsed; let last = og;
    setInterval(() => { if(window._scgCollapsed !== last){ log(`strip toggled -> ${window._scgCollapsed ? 'hidden' : 'shown'}`); last = window._scgCollapsed; } }, 250);
  };
  if(document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
