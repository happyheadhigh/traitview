/**
 * TraitView Database Seed Script
 * 
 * Run once to create tables and load all OCAS token/trait data.
 * 
 * Usage:
 *   npm install pg
 *   DATABASE_URL="postgresql://..." node seed-db.js
 * 
 * Expects these files in ./data/ relative to this script:
 *   fast/traits_fast.json  — ranks, freq, domain, buckets
 *   traits_chunks/traits_0001_1000.json ... traits_9001_10000.json
 */

const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable not set.');
  console.error('Usage: DATABASE_URL="postgresql://..." node seed-db.js');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, 'data');

async function main() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false } // Railway requires SSL
  });

  await client.connect();
  console.log('Connected to database.');

  // ── Create tables ────────────────────────────────────────────────────────────
  console.log('\nCreating tables...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS tokens (
      id            INTEGER PRIMARY KEY,
      obs_rank      INTEGER NOT NULL,
      rarity_score  REAL NOT NULL,
      trait_count   INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS token_traits (
      token_id    INTEGER NOT NULL REFERENCES tokens(id),
      trait_name  TEXT NOT NULL,
      trait_value TEXT NOT NULL,
      PRIMARY KEY (token_id, trait_name)
    );

    CREATE TABLE IF NOT EXISTS listings (
      token_id    INTEGER PRIMARY KEY REFERENCES tokens(id),
      price_eth   REAL NOT NULL,
      url         TEXT,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sales (
      id          SERIAL PRIMARY KEY,
      token_id    INTEGER REFERENCES tokens(id),
      price_eth   REAL NOT NULL,
      currency    TEXT NOT NULL DEFAULT 'ETH',
      buyer       TEXT,
      seller      TEXT,
      sale_ts     TIMESTAMPTZ NOT NULL,
      tx_hash     TEXT
    );
  `);

  // ── Indexes for fast queries ──────────────────────────────────────────────────
  console.log('Creating indexes...');
  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_token_traits_name_value 
      ON token_traits(trait_name, trait_value);
    CREATE INDEX IF NOT EXISTS idx_token_traits_token_id 
      ON token_traits(token_id);
    CREATE INDEX IF NOT EXISTS idx_tokens_obs_rank 
      ON tokens(obs_rank);
    CREATE INDEX IF NOT EXISTS idx_listings_price 
      ON listings(price_eth);
    CREATE INDEX IF NOT EXISTS idx_sales_ts 
      ON sales(sale_ts DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_token 
      ON sales(token_id);
  `);

  // ── Load traits_fast.json for ranks ──────────────────────────────────────────
  console.log('\nLoading traits_fast.json...');
  const fastPath = path.join(DATA_DIR, 'fast', 'traits_fast.json');
  if (!fs.existsSync(fastPath)) {
    console.error('ERROR: data/fast/traits_fast.json not found.');
    console.error('Make sure you run this script from your TraitView project folder.');
    process.exit(1);
  }
  const fast = JSON.parse(fs.readFileSync(fastPath, 'utf8'));

  // rank array is [[token_id, score], ...] sorted rarest first
  // index+1 = rank
  const rankMap = new Map(); // token_id → {rank, score}
  fast.rank.forEach(([id, score], i) => {
    rankMap.set(id, { rank: i + 1, score });
  });
  console.log(`  Loaded ranks for ${rankMap.size} tokens.`);

  // ── Load all trait chunks ─────────────────────────────────────────────────────
  console.log('\nLoading trait chunks...');
  const chunksDir = path.join(DATA_DIR, 'traits_chunks');
  const chunkFiles = fs.readdirSync(chunksDir)
    .filter(f => f.endsWith('.json') && !f.endsWith('.index.json'))
    .sort();
  console.log(`  Found ${chunkFiles.length} chunk files.`);

  // Collect all token data
  const allTokens = []; // {id, obs_rank, rarity_score, trait_count, traits: {name: value}}
  for (const file of chunkFiles) {
    const chunk = JSON.parse(fs.readFileSync(path.join(chunksDir, file), 'utf8'));
    for (const [idStr, row] of Object.entries(chunk)) {
      const id = parseInt(idStr, 10);
      const rankInfo = rankMap.get(id) || { rank: 9999, score: 0 };
      const traits = row.traits || {};
      const traitCount = Object.keys(traits).length;
      allTokens.push({ id, obs_rank: rankInfo.rank, rarity_score: rankInfo.score, trait_count: traitCount, traits });
    }
    process.stdout.write('.');
  }
  console.log(`\n  Loaded ${allTokens.length} tokens.`);

  // ── Insert tokens in batches ──────────────────────────────────────────────────
  console.log('\nInserting tokens...');
  await client.query('TRUNCATE token_traits, listings, sales, tokens CASCADE');

  const BATCH = 500;
  for (let i = 0; i < allTokens.length; i += BATCH) {
    const batch = allTokens.slice(i, i + BATCH);
    const values = batch.map((t, j) => 
      `($${j*4+1}, $${j*4+2}, $${j*4+3}, $${j*4+4})`
    ).join(', ');
    const params = batch.flatMap(t => [t.id, t.obs_rank, t.rarity_score, t.trait_count]);
    await client.query(
      `INSERT INTO tokens (id, obs_rank, rarity_score, trait_count) VALUES ${values} ON CONFLICT DO NOTHING`,
      params
    );
    process.stdout.write('.');
  }
  console.log(`\n  Inserted ${allTokens.length} tokens.`);

  // ── Insert token_traits in batches ────────────────────────────────────────────
  console.log('\nInserting token traits...');
  const allTraitRows = [];
  for (const token of allTokens) {
    for (const [name, value] of Object.entries(token.traits)) {
      if (value !== null && value !== undefined && String(value).trim() !== '') {
        allTraitRows.push([token.id, name, String(value)]);
      }
    }
  }
  console.log(`  Total trait rows: ${allTraitRows.length}`);

  for (let i = 0; i < allTraitRows.length; i += BATCH) {
    const batch = allTraitRows.slice(i, i + BATCH);
    const values = batch.map((_, j) =>
      `($${j*3+1}, $${j*3+2}, $${j*3+3})`
    ).join(', ');
    const params = batch.flat();
    await client.query(
      `INSERT INTO token_traits (token_id, trait_name, trait_value) VALUES ${values} ON CONFLICT DO NOTHING`,
      params
    );
    if (i % 5000 === 0) process.stdout.write('.');
  }
  console.log(`\n  Inserted ${allTraitRows.length} trait rows.`);

  // ── Verify ────────────────────────────────────────────────────────────────────
  const counts = await client.query(`
    SELECT 
      (SELECT COUNT(*) FROM tokens) as tokens,
      (SELECT COUNT(*) FROM token_traits) as traits
  `);
  console.log('\n✓ Database seeded successfully!');
  console.log(`  tokens:       ${counts.rows[0].tokens}`);
  console.log(`  token_traits: ${counts.rows[0].traits}`);

  // Show a quick sample query to verify it works
  console.log('\nSample query — tokens with Hair: Mohawk Blonde:');
  const sample = await client.query(`
    SELECT t.id, t.obs_rank 
    FROM tokens t
    JOIN token_traits tt ON tt.token_id = t.id
    WHERE tt.trait_name = 'Hair' AND tt.trait_value = 'Mohawk Blonde'
    ORDER BY t.obs_rank
    LIMIT 5
  `);
  console.log('  Results:', sample.rows);

  await client.end();
  console.log('\nDone! Database is ready.');
}

main().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
