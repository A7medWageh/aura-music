const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.NEON_DB_HOST || 'ep-round-bird-amxcwfry.c-5.us-east-1.aws.neon.tech',
  port: parseInt(process.env.NEON_DB_PORT || '5432', 10),
  user: process.env.NEON_DB_USERNAME || 'neondb_owner',
  password: process.env.NEON_DB_PASSWORD || 'npg_afv7RLgh1oSF',
  database: process.env.NEON_DB_NAME || 'neondb',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  try {
    console.log('[Migration] Creating telegram_audio_cache table in Neon DB...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS telegram_audio_cache (
        id SERIAL PRIMARY KEY,
        video_id VARCHAR(64),
        song_id VARCHAR(128),
        title VARCHAR(512) NOT NULL,
        artist VARCHAR(256),
        tg_file_id VARCHAR(512) NOT NULL,
        tg_message_id BIGINT,
        duration_sec INT,
        file_size BIGINT,
        mime_type VARCHAR(64) DEFAULT 'audio/mpeg',
        source VARCHAR(64) DEFAULT 'telegram',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        CONSTRAINT uq_tg_file_id UNIQUE (tg_file_id)
      );
      CREATE INDEX IF NOT EXISTS idx_tg_cache_vid ON telegram_audio_cache(video_id);
      CREATE INDEX IF NOT EXISTS idx_tg_cache_songid ON telegram_audio_cache(song_id);
      CREATE INDEX IF NOT EXISTS idx_tg_cache_title_artist ON telegram_audio_cache(LOWER(title), LOWER(artist));
    `);
    console.log('[Migration] telegram_audio_cache table ready!');
  } catch (err) {
    console.error('[Migration] Failed:', err);
  } finally {
    await pool.end();
  }
}

main();
