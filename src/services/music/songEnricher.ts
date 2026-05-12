/**
 * songEnricher.ts
 * ───────────────
 * Converts raw MusicApi songs into the QueueSong shape the player needs,
 * by resolving a YouTube videoId for each song via YouTube Music search.
 *
 * Strategy (bulletproof & fast):
 *   1. Search YouTube Music for "SONG_NAME ARTIST_NAME"
 *   2. Take the first result whose title fuzzy-matches (avoid wrong songs)
 *   3. Fall back to first result if no fuzzy match
 *   4. Cache videoId per song permanently in process (map)
 *
 * All searches run in parallel (batched) for max throughput.
 */

import { searchYouTube } from "@apis/youtubei.js";
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
  source: "musicapi";
}

// Permanent process-level cache: musicapi_song_id → youtubeVideoId
const videoIdCache = new Map<number, string | null>();

/** Simple fuzzy match: checks if every word of needle appears in haystack */
function fuzzyMatch(needle: string, haystack: string): boolean {
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  return n.split(/\s+/).every((word) => h.includes(word));
}

async function resolveVideoId(
  song: MApiSong,
  artistName: string
): Promise<string | null> {
  // Fast path: already resolved
  if (videoIdCache.has(song.id)) return videoIdCache.get(song.id)!;

  const query = `${song.name} ${artistName}`.trim();
  try {
    const results = await searchYouTube(query);
    const songs = results?.songs ?? [];
    if (!songs.length) {
      videoIdCache.set(song.id, null);
      return null;
    }

    // Prefer a result whose title contains the song name
    const best =
      songs.find((s: any) =>
        fuzzyMatch(song.name.split(/[-–(]/)[0].trim(), s.title ?? "")
      ) ?? songs[0];

    const videoId = best?.youtubeVideoId ?? best?.songId ?? null;
    videoIdCache.set(song.id, videoId);
    return videoId;
  } catch {
    videoIdCache.set(song.id, null);
    return null;
  }
}

/**
 * Enriches a batch of MusicApi songs with YouTube videoIds.
 * Runs all searches in parallel for maximum speed.
 */
export async function enrichSongs(
  songs: MApiSong[],
  artistsById: Map<number, MApiArtist>
): Promise<EnrichedSong[]> {
  // Resolve all videoIds in parallel
  const resolved = await Promise.all(
    songs.map(async (song) => {
      const artist = song.artistId ? artistsById.get(song.artistId) : null;
      const artistName = artist?.name ?? "فنان غير معروف";
      const videoId = await resolveVideoId(song, artistName);
      return {
        songId: `mapi-${song.id}`,
        title: song.name,
        artist: artistName,
        artistId: song.artistId ? String(song.artistId) : null,
        thumbnailUrl: song.imageUrl ?? null,
        youtubeVideoId: videoId,
        duration: song.duration ?? "",
        isFeatured: song.isFeatured ?? false,
        source: "musicapi" as const,
      };
    })
  );

  // Filter out songs where we couldn't find a YouTube videoId
  return resolved.filter((s) => s.youtubeVideoId !== null);
}
