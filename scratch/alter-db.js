const { Pool } = require('pg');
const pool = new Pool({
  host: 'ep-round-bird-amxcwfry.c-5.us-east-1.aws.neon.tech',
  port: 5432,
  user: 'neondb_owner',
  password: 'npg_afv7RLgh1oSF',
  database: 'neondb',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free';`);
    console.log("Successfully added tier column to users table.");
  } catch(e) {
    console.error('ERROR:', e.message);
  } finally {
    await pool.end();
  }
}

main();
