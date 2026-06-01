/**
 * songEnricher.ts
 * ───────────────
 * Since songs in the DB already have youtube_video_id pre-populated,
 * this enricher now simply formats the songs for the player.
 * No YouTube search needed!
 */

import type { MApiSong, MApiArtist } from "./musicApiClient";

export interface EnrichedSong {
  songId: string;
  title: string;
  artist: string;
  artistId: string | null;
  thumbnailUrl: string | null;
  youtubeVideoId: string | null;
  duration: string;
  isFeatured: boolean;
  source: "db";
}

/**
 * Enriches a batch of DB songs into the QueueSong shape the player needs.
 * Since youtube_video_id is already in the DB, this is instant.
 */
export async function enrichSongs(
  songs: MApiSong[],
  artistsById: Map<string, MApiArtist>
): Promise<EnrichedSong[]> {
  return songs.map((song) => {
    const artist = song.artistId ? artistsById.get(song.artistId) : null;
    const artistName = artist?.name ?? "فنان غير معروف";
    return {
      songId: song.id,
      title: song.name,
      artist: artistName,
      artistId: song.artistId ?? null,
      thumbnailUrl: song.imageUrl ?? null,
      youtubeVideoId: song.youtubeVideoId ?? null,
      duration: song.duration ?? "",
      isFeatured: song.isFeatured ?? false,
      source: "db" as const,
    };
  });
}
