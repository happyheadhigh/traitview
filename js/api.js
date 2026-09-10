/* TraitView API helpers.
   Loaded before app.js, after config.js (RAILWAY_API/RAILWAY_KEY are now
   set there by activateCollection(), per the active collection --
   collection-scoped, not fixed to OCAS's backend). */

async function dbFetch(path, params = {}) {
  // Confirmed live: every backend endpoint this app calls defaults to
  // OCAS's own slug when none is given (`req.query.slug || OCAS_SLUG` on the
  // server side) -- without this, every one of this file's ~18 dbFetch()
  // call sites would silently request OCAS's data even while a different
  // collection (e.g. Argonauts) is active, despite RAILWAY_API/RAILWAY_KEY
  // already correctly pointing at that collection's own backend service.
  // Auto-injecting slug here, once, centrally, covers every existing call
  // site without needing to touch each one individually -- a caller that
  // genuinely needs a different slug (rare) can still override it by
  // passing its own `slug` in params, since that spread happens after this.
  const qs = new URLSearchParams({ slug: LIVE_SLUG, ...params, key: RAILWAY_KEY });
  const r = await fetch(`${RAILWAY_API}${path}?${qs}`);
  if (!r.ok) throw new Error(`DB ${path} HTTP ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error(`DB ${path} returned non-JSON`);
  return r.json();
}