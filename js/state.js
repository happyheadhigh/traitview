/* TraitView global runtime state.
   Loaded after config.js and before app.js.
   Keep this as a classic script, not an ES module. */

let CONNECTED_WALLET = { address:null, chainId:null, tokenIds:[], tokenSet:new Set(), stats:null };
let CONNECTED_WALLET_OWNED_ONLY = false;
const TV_WALLET_PROVIDERS = [];