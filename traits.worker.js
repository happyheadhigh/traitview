/* perf/traits.worker.js
   Off‑main‑thread trait loading + stats building.
   Manifest expected at ./data/traits_manifest.json:
   { "chunk_size": 1000, "chunks_dir": "traits_chunks",
     "files": [ { "name":"traits_0001_1000.json", "start":1, "end":1000 }, ... ] }
*/
const Util = {
  abs(base, path){ try { return new URL(path, base).href; } catch(e){ return path; } },
  async fetchJson(url){ const r=await fetch(url,{cache:'force-cache'}); if(!r.ok) throw new Error(url+' '+r.status); return r.json(); },
};

self.onmessage = async (ev)=>{
  const cfg = ev.data||{};
  const BASE = cfg.BASE_URL || (self.origin || '');
  const DATA_DIR = cfg.DATA_DIR || './data';
  const MANIFEST_URL = Util.abs(BASE, cfg.MANIFEST_URL || (DATA_DIR + '/traits_manifest.json'));
  let CHUNK_SIZE = cfg.CHUNK_SIZE || 1000;
  let CHUNKS_DIR = cfg.CHUNKS_DIR || 'traits_chunks';

  try{
    const MAN = await Util.fetchJson(MANIFEST_URL);
    CHUNK_SIZE = MAN.chunk_size || CHUNK_SIZE;
    CHUNKS_DIR  = MAN.chunks_dir || CHUNKS_DIR;
    const files = Array.isArray(MAN.files) ? MAN.files : [];
    const TOKEN_COUNT = (files.at(-1)?.end) || 0;

    const TRAIT_FREQ = Object.create(null);
    const TRAIT_DOMAIN = Object.create(null);
    const BUCKETS = Object.create(null);
    const OBS_SCORES = new Map();

    const CONCURRENCY = cfg.CONCURRENCY || 8;

    function keepEntries(row){
      const out=[]; const t=row?.traits||{};
      for(const k of Object.keys(t)){
        const v = t[k]; if(v!==undefined && v!==null && String(v).trim()!==''){ out.push([k,String(v)]); }
      }
      return out;
    }

    async function loadChunk(file){
      const url = Util.abs(BASE, DATA_DIR + '/' + CHUNKS_DIR + '/' + file.name);
      const ch = await Util.fetchJson(url);
      return ch;
    }

    // simple concurrency runner over files
    const queue = files.slice();
    const runners = Array(Math.min(CONCURRENCY, queue.length)).fill(0).map(async ()=>{
      while(queue.length){
        const f = queue.shift();
        const ch = await loadChunk(f);

        // pass 1: histograms
        for(const [sid,row] of Object.entries(ch)){
          const traits = keepEntries(row);
          BUCKETS[traits.length] = (BUCKETS[traits.length]||0)+1;
          for(const [k,v] of traits){
            (TRAIT_DOMAIN[k] ||= new Set()).add(v);
            ((TRAIT_FREQ[k] ||= Object.create(null)))[v] = (TRAIT_FREQ[k][v]||0)+1;
          }
        }
        // pass 2: rough rarity score
        for(const [sid,row] of Object.entries(ch)){
          const id = +sid;
          const traits = keepEntries(row);
          let s=0;
          for(const [k,v] of traits){
            const c = (TRAIT_FREQ[k]?.[v]) || 1;
            const p = c / Math.max(1,TOKEN_COUNT);
            s += -Math.log(Math.max(p,1e-12));
          }
          OBS_SCORES.set(id, s);
        }

        // progress ping (lightweight)
        const domain = {};
        for(const k of Object.keys(TRAIT_DOMAIN)) domain[k] = Array.from(TRAIT_DOMAIN[k]);
        self.postMessage({ type:'progress', buckets: BUCKETS, domain });
        await new Promise(requestAnimationFrame);
      }
    });
    await Promise.all(runners);

    const finalScores = [];
    for(const [id,score] of OBS_SCORES.entries()) finalScores.push([id,score]);
    finalScores.sort((a,b)=>b[1]-a[1]);
    const rank = finalScores.map(([id,_s],i)=>[id, i+1]);

    const domain = {};
    for(const k of Object.keys(TRAIT_DOMAIN)) domain[k] = Array.from(TRAIT_DOMAIN[k]);
    self.postMessage({ type:'done', buckets: BUCKETS, rank, domain });
  }catch(e){
    self.postMessage({ type:'error', message: String(e && e.message || e) });
  }
};
