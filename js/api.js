/* TraitView API helpers.
   Loaded before app.js.
   Keep this as a classic script, not an ES module. */

// ── Railway DB API ────────────────────────────────────────────────────────────
const RAILWAY_API = 'https://ocas-sales-bot-production.up.railway.app';
const RAILWAY_KEY = 'AllStarSecret2k26TV';

async function dbFetch(path, params = {}) {
  const qs = new URLSearchParams({ ...params, key: RAILWAY_KEY });
  const r = await fetch(`${RAILWAY_API}${path}?${qs}`);
  if (!r.ok) throw new Error(`DB ${path} HTTP ${r.status}`);
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('application/json')) throw new Error(`DB ${path} returned non-JSON`);
  return r.json();
}