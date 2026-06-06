import { saveSongMeta, storeAudioBlob } from "@/offline/indexedDbCache";
import { startJob, updateJob, finishJob, setJobController } from "@/state/downloadStore";

// ── Download a single audio file and store it in IndexedDB ──────────────────
async function downloadAudioBlob(
  jobId: string, 
  songId: string, 
  videoId: string, 
  title: string,
  onProgress?: (received: number, total: number, delta: number) => void,
  signal?: AbortSignal
): Promise<boolean> {
  const MAX_RETRIES = 2;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      // Fetch direct URL from our fast resolver instead of relying on yt-dlp
      const resolveRes = await fetch(`/api/stream/${videoId}`);
      if (!resolveRes.ok) throw new Error(`Stream resolve failed: ${resolveRes.status}`);
      const resolvedData = await resolveRes.json();
      
      let url = resolvedData.streamUrl;
      if (!url) throw new Error("No stream URL returned");

      const res = await fetch(url, { cache: "no-store", signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const contentLength = parseInt(
        res.headers.get("x-original-content-length") || 
        res.headers.get("content-length") || 
        "0"
      );
      if (!onProgress) {
        updateJob(jobId, { totalBytes: contentLength, progressBytes: 0 });
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Body is null");

      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;

      console.log(`[Download] Starting read loop for ${title}...`);
      let chunksRead = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        chunksRead++;
        const delta = value.length;
        receivedBytes += delta;
        
        if (onProgress) {
          onProgress(receivedBytes, contentLength, delta);
        } else {
          updateJob(jobId, { progressBytes: receivedBytes });
        }
      }
      console.log(`[Download] Finished read loop for ${title}. Read ${chunksRead} chunks, ${receivedBytes} bytes.`);

      const blob = new Blob(chunks as any, { type: "audio/mpeg" });
      await storeAudioBlob(songId, blob);
      console.log(`[Download] Stored ${title} successfully in DB!`);
      return true;
    } catch (err: any) {
      if (err.name === "AbortError") {
        console.log(`[Download] Aborted for "${title}"`);
        return false;
      }
      lastError = err;
      console.warn(`[Download] Attempt ${attempt + 1} failed for "${title}":`, err.message);
      // Wait a bit before retry
      if (attempt < MAX_RETRIES - 1) await new Promise(r => setTimeout(r, 2000));
    }
  }

  const errorMsg = lastError?.message || "Unknown error";
  console.error(`[Download] Critical failure for "${title}": ${errorMsg}`);
  
  if (errorMsg.includes("500")) {
    console.error("[Download] Server returned 500. This is likely a resolution failure in YouTube API.");
  }
  return false;
}

/**
 * Download a single song — saves metadata instantly,
 * downloads audio in background with progress reporting.
 */
export async function downloadSong(
  songId: string,
  videoId: string,
  metadata?: {
    title?: string;
    artist?: string;
    thumbnailUrl?: string;
    albumId?: string;
    albumName?: string;
    folderName?: string;
  }
): Promise<boolean> {
  const title = metadata?.title || "أغنية محفوظة";
  const artist = metadata?.artist || "فنان غير معروف";

  const tier = typeof window !== "undefined" ? localStorage.getItem("aura_user_tier") : "free";
  if (tier !== "premium") {
    console.error("[Download] Offline downloads are restricted to Premium members only.");
    return false;
  }

  try {
    await saveSongMeta({
      songId,
      youtubeVideoId: videoId,
      title,
      artist,
      thumbnailUrl: metadata?.thumbnailUrl,
      albumId: metadata?.albumId,
      albumName: metadata?.albumName,
      folderName: metadata?.folderName || artist,
    });

    // Show single-song progress
    startJob(songId, title, "song", 1);
    updateJob(songId, { currentSong: title });
    
    const ctrl = new AbortController();
    setJobController(songId, ctrl);

    const ok = await downloadAudioBlob(songId, songId, videoId, title, undefined, ctrl.signal);
    
    // Check if it was cancelled
    if (ctrl.signal.aborted) return false;

    if (ok) updateJob(songId, { done: 1, failed: 0 });
    else updateJob(songId, { done: 0, failed: 1 });
    finishJob(songId, ok);
    return ok;
  } catch (err) {
    console.error(`[Library] Failed to save "${title}":`, err);
    finishJob(songId, false);
    return false;
  }
}

/** Alias used by some components */
export const saveSongToLibrary = downloadSong;

/**
 * Download all songs in an album with a live progress bar.
 * Uses a parallel batching system for maximum speed.
 */
export async function downloadAlbum(
  albumId: string,
  songs: any[],
  metadata: { albumName?: string; artistName?: string; coverUrl?: string }
): Promise<boolean> {
  const albumName = metadata.albumName || "ألبوم";
  const total = songs.length;
  
  const tier = typeof window !== "undefined" ? localStorage.getItem("aura_user_tier") : "free";
  if (tier !== "premium") {
    console.error("[Download] Offline downloads are restricted to Premium members only.");
    return false;
  }

  const CONCURRENCY = 20; // Increased for "rocket" speed

  // Register the job
  startJob(albumId, albumName, "album", total);
  updateJob(albumId, { totalBytes: total * 3.5 * 1024 * 1024, progressBytes: 0 }); // 3.5MB average per song for smooth progress
  
  const ctrl = new AbortController();
  setJobController(albumId, ctrl);

  let doneCount = 0;
  let failedCount = 0;
  let totalAccumulatedBytes = 0;

  // Process songs in chunks of CONCURRENCY
  for (let i = 0; i < songs.length; i += CONCURRENCY) {
    const batch = songs.slice(i, i + CONCURRENCY);
    
    await Promise.all(batch.map(async (song) => {
      const title = song.title || "أغنية";
      updateJob(albumId, { currentSong: title });

      try {
        await saveSongMeta({
          songId: song.songId,
          youtubeVideoId: song.youtubeVideoId,
          title,
          artist: metadata.artistName || song.artist || "فنان غير معروف",
          thumbnailUrl: metadata.coverUrl || song.thumbnailUrl,
          albumId,
          albumName,
          folderName: metadata.artistName || song.artist || "أخرى",
        });
      } catch { /* continue */ }

      const ok = await downloadAudioBlob(
        albumId, 
        song.songId, 
        song.youtubeVideoId, 
        title,
        (received, total, delta) => {
          totalAccumulatedBytes += delta;
          // Update total bytes in store (cumulative)
          updateJob(albumId, { progressBytes: totalAccumulatedBytes });
        },
        ctrl.signal
      );

      if (ctrl.signal.aborted) return; // Stop if aborted

      if (ok) doneCount++; else failedCount++;
      updateJob(albumId, { done: doneCount, failed: failedCount });
    }));
    
    if (ctrl.signal.aborted) break;
  }

  if (!ctrl.signal.aborted) {
    finishJob(albumId, failedCount === 0);
  }
  return failedCount === 0;
}
