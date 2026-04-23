import { resolveStream } from "@apis/youtubei.js";

// In-memory stream URL cache (expires after 4 hours)
const streamCache = new Map<string, { url: string; expiresAt: number }>();

export async function getStreamingUrl(videoId: string): Promise<string> {
  const cached = streamCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }

  const url = await resolveStream(videoId);
  streamCache.set(videoId, { url, expiresAt: Date.now() + 4 * 60 * 60 * 1000 });
  return url;
}

/** Pre-warm the cache for a video (fire and forget) */
export function prefetchStream(videoId: string): void {
  if (!videoId) return;
  const cached = streamCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return; // already cached
  
  resolveStream(videoId)
    .then(url => streamCache.set(videoId, { url, expiresAt: Date.now() + 4 * 60 * 60 * 1000 }))
    .catch(() => {}); // silent fail
}
