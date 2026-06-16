import { saveSongMeta, storeAudioBlob, storeLyrics, getAudioBlob, getAllOfflineSongs } from "@/offline/indexedDbCache";
import { startJob, updateJob, finishJob, setJobController, isJobPaused } from "@/state/downloadStore";

// --- Helpers ---
function getSmartFolderName(rawArtist: string, allSongs: any[]): string {
  if (!rawArtist) return "أخرى";
  
  const existingFolders = new Set(allSongs.map(s => s.folderName).filter(Boolean));
  
  // Split multiple artists by common separators
  const parts = rawArtist.split(/&| و | x | X | ft\.? | feat\.? |,|،/).map(p => p.trim()).filter(Boolean);
  
  if (parts.length === 0) return "أخرى";
  if (parts.length === 1) return parts[0];

  // Try to find if any of the split artists already have a folder
  const matched = parts.find(p => existingFolders.has(p));
  if (matched) return matched;
  
  // Fallback to the first artist in the list (primary artist)
  return parts[0];
}

// ── Download a single audio file and store it in IndexedDB ──────────────────
async function downloadAudioBlob(
  jobId: string, 
  songId: string, 
  videoId: string, 
  title: string,
  artist: string,
  onProgress?: (received: number, total: number, delta: number) => void,
  signal?: AbortSignal
): Promise<boolean> {
  const MAX_RETRIES = 2;
  let lastError = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      if (signal?.aborted) return false;
      
      const apiUrl = `/api/ytdownload?videoId=${encodeURIComponent(videoId)}&title=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}&t=${Date.now()}`;
      const res = await fetch(apiUrl, { cache: "no-store", signal });
      if (!res.ok) throw new Error(`API HTTP ${res.status}`);

      // Optional content-length if server provides it
      let contentLength = parseInt(
        res.headers.get("x-original-content-length") || 
        res.headers.get("content-length") || 
        "0"
      );
      
      // Fallback estimate for UI progress (approx 3.5 MB if unknown)
      if (contentLength === 0 && !onProgress) {
        contentLength = 3.5 * 1024 * 1024; 
      }

      if (!onProgress) {
        updateJob(jobId, { totalBytes: contentLength, progressBytes: 0 });
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Body is null");

      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;

      while (true) {
        // Pause logic: wait if paused
        while (isJobPaused(jobId)) {
          if (signal?.aborted) return false;
          await new Promise(r => setTimeout(r, 500));
        }

        const { done, value } = await reader.read();
        if (done) break;
        if (signal?.aborted) return false;

        // Process in 64KB chunks to simulate smooth download
        let offset = 0;
        const chunkSize = 64 * 1024;
        
        while (offset < value.length) {
          const slice = value.slice(offset, offset + chunkSize);
          chunks.push(slice);
          const delta = slice.length;
          receivedBytes += delta;
          
          if (onProgress) {
            onProgress(receivedBytes, contentLength, delta);
          } else {
            updateJob(jobId, { progressBytes: receivedBytes });
          }

          offset += chunkSize;
          // Add 15ms delay per 64KB (approx 4.2MB/s simulation)
          await new Promise(r => setTimeout(r, 15));
        }
      }

      if (receivedBytes < 1000) {
        throw new Error("Download resulted in an empty file. Possible 403 or interception.");
      }

      const blob = new Blob(chunks as any, { type: "audio/mpeg" });
      await storeAudioBlob(songId, blob);
      
      return true;
    } catch (err: any) {
      if (err.name === "AbortError" || signal?.aborted) {
        return false;
      }
      lastError = err;
      if (attempt < MAX_RETRIES - 1) await new Promise(r => setTimeout(r, 2000));
    }
  }

  const errorMsg = lastError?.message || "Unknown error";
  console.error(`[Download] Critical failure for "${title}": ${errorMsg}`);
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

  try {
    const allSongs = await getAllOfflineSongs();
    const smartFolder = getSmartFolderName(metadata?.folderName || artist, allSongs);

    await saveSongMeta({
      songId,
      youtubeVideoId: videoId,
      title,
      artist,
      thumbnailUrl: metadata?.thumbnailUrl,
      albumId: metadata?.albumId,
      albumName: metadata?.albumName,
      folderName: smartFolder,
    });

    startJob(songId, title, "song", 1);
    updateJob(songId, { currentSong: title });
    
    const ctrl = new AbortController();
    setJobController(songId, ctrl);

    const ok = await downloadAudioBlob(songId, songId, videoId, title, artist, undefined, ctrl.signal);
    
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

export const saveSongToLibrary = downloadSong;

/**
 * Download all songs in an album with a live progress bar.
 */
export async function downloadAlbum(
  albumId: string,
  songs: any[],
  metadata: { albumName?: string; artistName?: string; coverUrl?: string }
): Promise<boolean> {
  const albumName = metadata.albumName || "ألبوم";
  const total = songs.length;
  const CONCURRENCY = 1; // Process one by one to show progress properly

  const allSongs = await getAllOfflineSongs();
  const smartFolder = getSmartFolderName(metadata.artistName || songs[0]?.artist || "أخرى", allSongs);

  startJob(albumId, albumName, "album", total);
  updateJob(albumId, { totalBytes: total * 3.5 * 1024 * 1024, progressBytes: 0 }); 
  
  const ctrl = new AbortController();
  setJobController(albumId, ctrl);

  let doneCount = 0;
  let failedCount = 0;
  let totalAccumulatedBytes = 0;

  for (let i = 0; i < songs.length; i += CONCURRENCY) {
    if (ctrl.signal.aborted) break;
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
          folderName: smartFolder,
        });
      } catch {}

      // If song already exists, just update progress and skip download!
      const existingBlob = await getAudioBlob(song.songId);
      if (existingBlob) {
        totalAccumulatedBytes += existingBlob.size || (3.5 * 1024 * 1024);
        updateJob(albumId, { progressBytes: totalAccumulatedBytes });
        doneCount++;
        updateJob(albumId, { done: doneCount, failed: failedCount });
        return;
      }

      const ok = await downloadAudioBlob(
        albumId, 
        song.songId, 
        song.youtubeVideoId, 
        title,
        metadata.artistName || song.artist || "فنان غير معروف",
        (received, total, delta) => {
          totalAccumulatedBytes += delta;
          updateJob(albumId, { progressBytes: totalAccumulatedBytes });
        },
        ctrl.signal
      );

      if (ctrl.signal.aborted) return;
      if (ok) doneCount++; else failedCount++;
      updateJob(albumId, { done: doneCount, failed: failedCount });
    }));
  }

  if (!ctrl.signal.aborted) {
    finishJob(albumId, failedCount === 0);
  }
  return failedCount === 0;
}
