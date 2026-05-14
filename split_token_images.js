// split_token_images.js
// Usage: node split_token_images.js ./data/token_images.json ./data --targetMB=20
// Produces: token_images_1.json, token_images_2.json, ... + token_images_manifest.json

const fs = require('fs');
const path = require('path');

function parseArgs() {
  const [,, inFile, outDir, ...rest] = process.argv;
  if (!inFile || !outDir) {
    console.error('Usage: node split_token_images.js <input.json> <outDir> [--targetMB=20] [--maxIds=2000]');
    process.exit(1);
  }
  let targetMB = 20;       // aim for < 25MB Pages limit; leave headroom
  let maxIds = null;       // optional hard cap by token count per file
  for (const arg of rest) {
    if (arg.startsWith('--targetMB=')) targetMB = Number(arg.split('=')[1] || '20');
    if (arg.startsWith('--maxIds=')) maxIds = Number(arg.split('=')[1] || '0') || null;
  }
  return { inFile, outDir, targetBytes: Math.floor(targetMB * 1024 * 1024), maxIds };
}

function loadJson(p) {
  const raw = fs.readFileSync(p, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error('Could not parse JSON at', p);
    throw e;
  }
}

function toPairs(objOrArr) {
  if (Array.isArray(objOrArr)) {
    // assume [{id:123, url:'...'}] or [[id,url], ...]
    if (objOrArr.length && typeof objOrArr[0] === 'object' && !Array.isArray(objOrArr[0])) {
      return objOrArr.map(x => [String(x.id ?? x.tokenId ?? x[0]), x.url ?? x.image ?? x[1]]);
    }
    return objOrArr.map(x => [String(x[0]), x[1]]);
  }
  return Object.entries(objOrArr);
}

function main() {
  const { inFile, outDir, targetBytes, maxIds } = parseArgs();
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

  const src = loadJson(inFile);
  let pairs = toPairs(src)
    .filter(([k,v]) => k != null && v != null)
    .map(([k,v]) => [String(k), v]);

  // Sort numerically by token id if possible
  pairs.sort((a,b) => (parseInt(a[0],10)||0) - (parseInt(b[0],10)||0));

  const chunks = [];
  let current = [];
  let size = 0; // estimated serialized size of the current chunk

  const flush = () => {
    if (!current.length) return;
    chunks.push(current);
    current = [];
    size = 0;
  };

  for (const [k, v] of pairs) {
    // optimistic: serialize one entry to measure size growth
    const entryBytes = Buffer.byteLength(JSON.stringify([k, v]));
    const sepBytes = current.length ? 1 : 0; // comma
    const braceOverhead = 2; // for {}
    const newSize = size + entryBytes + sepBytes;

    const wouldExceedBySize = newSize + braceOverhead > targetBytes;
    const wouldExceedByCount = maxIds && current.length >= maxIds;

    if ((wouldExceedBySize || wouldExceedByCount) && current.length) {
      flush();
    }
    current.push([k, v]);
    size = current.reduce((acc, kv, i) => acc + Buffer.byteLength(JSON.stringify(kv)) + (i?1:0), 0);
  }
  flush();

  // Write chunks as minified objects: { "1":"url", "2":"url", ... }
  const manifest = [];
  chunks.forEach((chunk, i) => {
    const firstId = chunk[0][0];
    const lastId  = chunk[chunk.length-1][0];
    const obj = {};
    for (const [k,v] of chunk) obj[k] = v;
    const file = `token_images_${i+1}.json`;
    const outPath = path.join(outDir, file);
    fs.writeFileSync(outPath, JSON.stringify(obj));
    const bytes = fs.statSync(outPath).size;
    manifest.push({ file, startId: firstId, endId: lastId, count: chunk.length, bytes });
    console.log(`Wrote ${file} (${chunk.length} ids, ${(bytes/1024/1024).toFixed(2)} MB)`);
  });

  // Write manifest
  const manifestPath = path.join(outDir, 'token_images_manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ chunks: manifest }, null, 2));
  console.log(`\nManifest: ${manifestPath}`);
  console.table(manifest);
}

main();
