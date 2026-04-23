import { query as dbQuery } from "@apis/neon";

type InputItem = {
  videoId: string;
  title: string;
  artistName: string;
  durationSeconds: number;
  thumbnailUrl: string | null;
};

export async function ingestYouTubeItems(items: InputItem[]) {
  if (!items.length) return;
  for (const item of items) {
    const artistId = await ensureArtist(item.artistName, item.thumbnailUrl);
    const albumId = await ensureAlbum(artistId, "سنجلات من يوتيوب", item.thumbnailUrl);
    await dbQuery(
      `
        INSERT INTO songs (
          youtube_video_id, artist_id, album_id, title, duration_seconds, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
        ON CONFLICT (youtube_video_id) DO UPDATE
        SET title = EXCLUDED.title,
            artist_id = EXCLUDED.artist_id,
            album_id = EXCLUDED.album_id,
            duration_seconds = EXCLUDED.duration_seconds,
            metadata = EXCLUDED.metadata
      `,
      [
        item.videoId,
        artistId,
        albumId,
        item.title,
        Math.max(0, item.durationSeconds || 0),
        JSON.stringify({ thumbnailUrl: item.thumbnailUrl, source: "youtube" })
      ]
    );
  }
}

async function ensureArtist(name: string, imageUrl: string | null) {
  const existing = await dbQuery<{ id: string }>(`SELECT id FROM artists WHERE name = $1 LIMIT 1`, [name]);
  if (existing.rows[0]?.id) return existing.rows[0].id;
  const created = await dbQuery<{ id: string }>(
    `INSERT INTO artists (name, image_url) VALUES ($1, $2) RETURNING id`,
    [name, imageUrl]
  );
  return created.rows[0].id;
}

async function ensureAlbum(artistId: string, title: string, coverUrl: string | null) {
  const existing = await dbQuery<{ id: string }>(
    `SELECT id FROM albums WHERE artist_id = $1 AND title = $2 LIMIT 1`,
    [artistId, title]
  );
  if (existing.rows[0]?.id) return existing.rows[0].id;
  const created = await dbQuery<{ id: string }>(
    `INSERT INTO albums (artist_id, title, cover_url) VALUES ($1, $2, $3) RETURNING id`,
    [artistId, title, coverUrl]
  );
  return created.rows[0].id;
}
