/* TraitView data/config helpers.
   Loaded before app.js.
   Keep this as a classic script, not an ES module. */

// Optional: drop your OpenSea API key here, or set it via:
// localStorage.setItem('OPENSEA_KEY','...')
const OPENSEA_API_KEY = (localStorage.getItem('OPENSEA_KEY') || '').trim();

// Tiny preference helper. Saves to browser localStorage.
const PREF = {
  get: (k, d='') => (localStorage.getItem(k) ?? d),
  set: (k, v) => localStorage.setItem(k, String(v)),
};

/* data conf */
const DATA_DIR = './data';
const MANIFEST_URL = `${DATA_DIR}/traits_manifest.json`;
const IMAGES_MANIFEST_URL = `${DATA_DIR}/token_images_manifest.json`;
const IMAGES_URL = `${DATA_DIR}/token_images.json`;
const IMAGE_PATTERN = `${DATA_DIR}/images/{id}.png`;
const PROB_URL = `${DATA_DIR}/ocas_probabilities.json`;