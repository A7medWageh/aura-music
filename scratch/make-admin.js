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
  const email = 'emil578jvcvn@gmail.com';
  try {
    const res = await pool.query(`UPDATE users SET role = 'admin', tier = 'premium' WHERE email = $1 RETURNING id`, [email]);
    if (res.rowCount > 0) {
      console.log(`Success: Set role=admin and tier=premium for ${email}`);
    } else {
      console.log(`User ${email} not found. Please register first.`);
    }
  } catch(e) {
    console.error('ERROR:', e.message);
  } finally {
    await pool.end();
  }
}

main();
