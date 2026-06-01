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
    // Count rows in each table
    const tables = ['artists', 'albums', 'songs', '"Songs"'];
    for (const t of tables) {
      try {
        const r = await pool.query(`SELECT COUNT(*) as cnt FROM ${t}`);
        console.log(`${t}: ${r.rows[0].cnt} rows`);
      } catch(e) { console.log(`${t}: ERROR - ${e.message}`); }
    }

    // Sample artists
    const artists = await pool.query('SELECT id, name, image_url FROM artists LIMIT 5');
    console.log('\nArtists sample:');
    artists.rows.forEach(r => console.log(`  ${r.id} | ${r.name} | ${r.image_url?.substring(0,60)}`));

    // Sample songs with youtube_video_id
    const songs = await pool.query(`
      SELECT s.id, s.title, s.youtube_video_id, s.audio_url, a.name as artist_name 
      FROM songs s 
      LEFT JOIN artists a ON s.artist_id = a.id 
      LIMIT 10
    `);
    console.log('\nSongs sample:');
    songs.rows.forEach(r => console.log(`  ${r.title} | ${r.artist_name} | yt:${r.youtube_video_id} | audio:${r.audio_url?.substring(0,50)}`));

    // Songs with audio_url set
    const withAudio = await pool.query(`SELECT COUNT(*) as cnt FROM songs WHERE audio_url IS NOT NULL AND audio_url != ''`);
    console.log(`\nSongs with audio_url: ${withAudio.rows[0].cnt}`);
    
    // Songs with youtube_video_id set
    const withYt = await pool.query(`SELECT COUNT(*) as cnt FROM songs WHERE youtube_video_id IS NOT NULL AND youtube_video_id != ''`);
    console.log(`Songs with youtube_video_id: ${withYt.rows[0].cnt}`);

    // Sample Songs (capital) 
    const legacySongs = await pool.query(`SELECT id, name, "audioUrl", "imageUrl" FROM "Songs" LIMIT 5`);
    console.log('\nLegacy Songs sample:');
    legacySongs.rows.forEach(r => console.log(`  ${r.id} | ${r.name} | ${r.audioUrl?.substring(0,60)}`));

  } catch(e) {
    console.error('ERROR:', e.message);
  } finally {
    await pool.end();
  }
}

main();
