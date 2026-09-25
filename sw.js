/* TraitView service worker -- installable app (PWA).
   jv: "I think I want to build out an app for traitview" -> step 1: an
   installable web app. Deliberately conservative so deploys are never
   hidden behind a stale cache:
   - Page loads (navigations): ALWAYS network first; the cached copy is used
     only when offline.
   - Same-origin /js/ and /css/ files: every deploy bumps their ?v=, so a
     cached copy is always the exact version the page asked for ->
     cache-first is safe and makes app launches fast.
   - App icons/logo: stale-while-revalidate.
   - Everything else -- API data, sales, listings, token images (all
     cross-origin), trait data files -- is NOT intercepted at all. */
const VERSION = 'tv-sw-3'; // bumped: page always revalidated
const PAGE_CACHE = VERSION + '-pages';
const ASSET_CACHE = VERSION + '-assets';

// On install, save the page AND every versioned script/stylesheet it
// references, so an offline launch has the whole app -- files the first
// visit loaded before this worker was running would otherwise be missing
// (e.g. formatUtils.js -> 'chainBadgeHtml is not defined' offline).
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try{
      const pages = await caches.open(PAGE_CACHE);
      const res = await fetch('/', { cache: 'no-store' });
      if(res.ok){
        await pages.put('/', res.clone());
        const html = await res.text();
        const urls = [...html.matchAll(/(?:src|href)="\.?(\/(?:js|css)\/[^"]+\?v=[^"]+)"/g)].map(m => m[1]);
        const assets = await caches.open(ASSET_CACHE);
        await Promise.all([...new Set(urls)].map(u => assets.add(u).catch(() => {})));
      }
      await pages.addAll(['/manifest.json', '/images/icons/icon-192.png']).catch(() => {});
    }catch(_){}
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin !== self.location.origin) return; // API, images, CDNs: untouched

  // Page loads: network first, offline fallback.
  if(req.mode === 'navigate'){
    // Always revalidate the page with the server ('no-cache'): a plain fetch
    // could be answered from the browser's HTTP cache, so the installed app
    // might keep running the previous deploy (jv's still-broken 'show
    // images' button after a fix shipped).
    event.respondWith(
      fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' }).then(res => {
        if(res && res.ok){ const copy = res.clone(); caches.open(PAGE_CACHE).then(c => c.put('/', copy)).catch(()=>{}); }
        return res;
      }).catch(() => caches.match('/').then(r => r || new Response(
        '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="background:#0a0a0a;color:#ccc;font:15px system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center">TraitView needs a connection.<br>Check your signal and try again.</body>',
        { headers: { 'Content-Type': 'text/html' } })))
    );
    return;
  }

  // Versioned scripts/styles: cache-first (the ?v= changes on every deploy).
  if((url.pathname.startsWith('/js/') || url.pathname.startsWith('/css/')) && url.searchParams.has('v')){
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if(res && res.ok){
          const copy = res.clone();
          // Keep only the newest version of each file: drop older ?v= copies
          // so the cache doesn't grow with every deploy.
          caches.open(ASSET_CACHE).then(c => c.put(req, copy).then(() => c.keys()).then(keys => Promise.all(
            keys.filter(k => { const u = new URL(k.url); return u.pathname === url.pathname && u.searchParams.get('v') !== url.searchParams.get('v'); })
                .map(k => c.delete(k))
          ))).catch(()=>{});
        }
        return res;
      }))
    );
    return;
  }

  // Icons/logo: stale-while-revalidate.
  if(url.pathname.startsWith('/images/icons/') || url.pathname === '/images/traitview-logo.png'){
    event.respondWith(
      caches.open(ASSET_CACHE).then(c => c.match(req).then(hit => {
        const net = fetch(req).then(res => { if(res && res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
        return hit || net;
      }))
    );
  }
  // anything else: not intercepted
});

// ── Push notifications (TraitView alerts) ─────────────────────────────────
// jv: "push notifications should work just like the discord bot". The bot
// (lib/push.js) sends {title, body, url, tag}. Tapping a notification
// focuses an open TraitView window (navigating it to the alert's page) or
// opens one.
self.addEventListener('push', event => {
  let data = {};
  try{ data = event.data ? event.data.json() : {}; }catch(_){ data = { title: 'TraitView', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'TraitView';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/images/icons/icon-192.png',
    badge: '/images/icons/icon-192.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for(const w of wins){
      if(new URL(w.url).origin === self.location.origin){
        try{ await w.navigate(target); }catch(_){}
        return w.focus();
      }
    }
    return self.clients.openWindow(target);
  })());
});
