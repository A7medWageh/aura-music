import { saveSongMeta, storeAudioBlob, storeLyrics, getAudioBlob, getAllOfflineSongs } from "@/offline/indexedDbCache";
import { startJob, updateJob, finishJob, setJobController, isJobPaused } from "@/state/downloadStore";

// ─── Types ────────────────────────────────────────────────────────────────────
type SongMeta = {
  title?: string;
  artist?: string;
  thumbnailUrl?: string;
  albumId?: string;
  albumName?: string;
  folderName?: string;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getSmartFolderName(rawArtist: string, allSongs: any[], title?: string): string {
  let artist = rawArtist;
  if (!artist || artist === "فنان" || artist === "فنان غير معروف") {
    if (title && title.includes("-")) {
      const parts = title.split("-");
      if (parts[0].trim().length > 1) {
        artist = parts[0].trim();
      }
    }
  }
  if (!artist || artist === "فنان" || artist === "فنان غير معروف") return "أخرى";
  const existingFolders = new Set(allSongs.map(s => s.folderName).filter(Boolean));
  const parts = artist.split(/&| و | x | X | ft\.? | feat\.? |,|،/).map(p => p.trim()).filter(Boolean);
  if (parts.length === 0) return "أخرى";
  if (parts.length === 1) return parts[0];
  const matched = parts.find(p => existingFolders.has(p));
  if (matched) return matched;
  return parts[0];
}

// ─── Check Background Fetch API support ───────────────────────────────────────
function isBgFetchSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "serviceWorker" in navigator && "BackgroundFetchManager" in window;
}

// ─── Background Fetch download (survives tab/browser close) ──────────────────
async function downloadViaBackgroundFetch(
  jobId: string,
  songId: string,
  videoId: string,
  title: string,
  artist: string
): Promise<boolean> {
  try {
    const sw = (await navigator.serviceWorker.ready) as any;
    if (!sw.backgroundFetch) throw new Error("No BackgroundFetch on registration");

    const params = new URLSearchParams();
    if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) params.set("videoId", videoId);
    if (title) params.set("title", title);
    if (artist) params.set("artist", artist);
    params.set("proxy", "true");
    params.set("download", "true");
    params.set("t", Date.now().toString());

    const url = `/api/ytdownload?${params.toString()}`;
    const fetchId = `song-${songId}-${Date.now()}`;

    // Start the background fetch
    const reg = await sw.backgroundFetch.fetch(fetchId, [url], {
      title: `Aura — ${title}`,
      icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
      downloadTotal: 0,
    });

    // Listen for progress/done via SW messages
    return await new Promise<boolean>((resolve) => {
      let progressListener: ((e: MessageEvent) => void) | null = null;

      progressListener = (e: MessageEvent) => {
        if (!e.data) return;

        if (e.data.type === "BG_FETCH_PROGRESS" && e.data.fetchId === reg.id) {
          const { downloaded, downloadTotal } = e.data;
          const fakeTotal = 3.5 * 1024 * 1024;
          const actualTotal = downloadTotal > 0 ? downloadTotal : Math.max(downloaded + 1024 * 1024, fakeTotal);
          updateJob(jobId, { progressBytes: downloaded, totalBytes: actualTotal });
        }

        if (e.data.type === "BG_FETCH_DONE" && e.data.fetchId === reg.id) {
          navigator.serviceWorker.removeEventListener("message", progressListener!);
          // Retrieve from cache and store in IndexedDB
          caches.open("aura-bg-downloads").then(async (cache) => {
            const cachedResp = await cache.match(url);
            if (cachedResp) {
              const blob = await cachedResp.blob();
              await storeAudioBlob(songId, blob);
              cache.delete(url); // Free cache space
              updateJob(jobId, { done: 1, failed: 0, progressBytes: blob.size, totalBytes: blob.size });
              finishJob(jobId, true);
              resolve(true);
            } else {
              finishJob(jobId, false);
              resolve(false);
            }
          }).catch(() => { finishJob(jobId, false); resolve(false); });
        }

        if ((e.data.type === "BG_FETCH_FAIL" || e.data.type === "BG_FETCH_ABORT") && e.data.fetchId === reg.id) {
          navigator.serviceWorker.removeEventListener("message", progressListener!);
          updateJob(jobId, { done: 0, failed: 1 });
          finishJob(jobId, false);
          resolve(false);
        }
      };

      navigator.serviceWorker.addEventListener("message", progressListener);

      // Timeout: if no completion in 10 minutes, fall back
      setTimeout(() => {
        navigator.serviceWorker.removeEventListener("message", progressListener!);
        resolve(false);
      }, 10 * 60 * 1000);
    });
  } catch (err: any) {
    console.warn("[Downloader] BackgroundFetch failed, using fallback:", err.message);
    return false;
  }
}

// ─── Standard streaming download (foreground, with progress) ─────────────────
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

      const params = new URLSearchParams();
      if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) params.set("videoId", videoId);
      if (title) params.set("title", title);
      if (artist) params.set("artist", artist);
      params.set("proxy", "true");
      params.set("download", "true");
      params.set("t", Date.now().toString());

      const apiUrl = `/api/ytdownload?${params.toString()}`;
      const res = await fetch(apiUrl, {
        cache: "no-store",
        signal,
        headers: {
          "X-Aura-Offline": "true",
          "Accept": "audio/*, application/octet-stream",
        },
      });
      if (!res.ok) throw new Error(`API HTTP ${res.status}`);

      let contentLength = parseInt(
        res.headers.get("x-original-content-length") ||
        res.headers.get("content-length") ||
        "0"
      );
      if (contentLength === 0) contentLength = 3.5 * 1024 * 1024;
      updateJob(jobId, { totalBytes: contentLength, progressBytes: 1 });

      const reader = res.body?.getReader();
      if (!reader) throw new Error("Body is null");

      const chunks: Uint8Array[] = [];
      let receivedBytes = 0;
      let lastReport = Date.now();

      while (true) {
        // Pause support
        while (isJobPaused(jobId)) {
          if (signal?.aborted) return false;
          await new Promise(r => setTimeout(r, 400));
        }
        const { done, value } = await reader.read();
        if (done) break;
        if (signal?.aborted) return false;

        chunks.push(value);
        const delta = value.length;
        receivedBytes += delta;

        const now = Date.now();
        // Update at least every 80ms or on completion for butter-smooth UI counters
        if (now - lastReport > 80 || receivedBytes >= contentLength) {
          lastReport = now;
          const currentTotal = Math.max(contentLength, receivedBytes);
          if (onProgress) onProgress(receivedBytes, currentTotal, delta);
          updateJob(jobId, { progressBytes: receivedBytes, totalBytes: currentTotal });
        }
      }

      if (receivedBytes < 1000) throw new Error("الملف الصوتي فارغ أو تم رفض الوصول");

      updateJob(jobId, { progressBytes: receivedBytes, totalBytes: receivedBytes });

      const mimeType = res.headers.get("content-type") || "audio/mpeg";
      const blob = new Blob(chunks as any, { type: mimeType });
      await storeAudioBlob(songId, blob);
      return true;
    } catch (err: any) {
      if (err.name === "AbortError" || signal?.aborted) return false;
      lastError = err;
      if (attempt < MAX_RETRIES - 1) await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.error(`[Download] Critical failure for "${title}":`, lastError?.message);
  return false;
}

// ─── Public API: downloadSong ─────────────────────────────────────────────────
/**
 * Download a song to offline storage with instant live progress.
 */
export async function downloadSong(
  songId: string,
  videoId: string,
  metadata?: SongMeta
): Promise<boolean> {
  const title = metadata?.title || "أغنية محفوظة";
  const artist = metadata?.artist || "فنان غير معروف";

  try {
    const allSongs = await getAllOfflineSongs();
    const smartFolder = getSmartFolderName(metadata?.folderName || artist, allSongs, title);

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
    updateJob(songId, { currentSong: title, totalBytes: 3.5 * 1024 * 1024, progressBytes: 1 });

    const ctrl = new AbortController();
    setJobController(songId, ctrl);
    const ok = await downloadAudioBlob(songId, songId, videoId, title, artist, undefined, ctrl.signal);
    if (ctrl.signal.aborted) return false;
    if (ok) {
      updateJob(songId, { done: 1, failed: 0 });
      // Asynchronously pre-cache lyrics for offline use
      fetch(`/api/lyrics?trackName=${encodeURIComponent(title)}&artistName=${encodeURIComponent(artist)}&videoId=${videoId}`)
        .then(r => r.json())
        .then(async (d) => {
          if (d.lyrics || d.syncedLyrics) {
            await storeLyrics(songId, { lyrics: d.lyrics, syncedLyrics: d.syncedLyrics });
            console.log(`[Downloader] Offline lyrics saved for "${title}"`);
          }
        })
        .catch(() => {});
    } else {
      updateJob(songId, { done: 0, failed: 1 });
    }
    finishJob(songId, ok);
    return ok;
  } catch (err) {
    console.error(`[Library] Failed to save "${title}":`, err);
    finishJob(songId, false);
    return false;
  }
}

export const saveSongToLibrary = downloadSong;

// ─── Public API: downloadAlbum ────────────────────────────────────────────────
/**
 * Download all songs in an album sequentially with live progress.
 */
export async function downloadAlbum(
  albumId: string,
  songs: any[],
  metadata: { albumName?: string; artistName?: string; coverUrl?: string }
): Promise<boolean> {
  const albumName = metadata.albumName || "ألبوم";
  const total = songs.length;

  const allSongs = await getAllOfflineSongs();
  const smartFolder = getSmartFolderName(metadata.artistName || songs[0]?.artist || "أخرى", allSongs);

  startJob(albumId, albumName, "album", total);
  updateJob(albumId, { totalBytes: total * 3.5 * 1024 * 1024, progressBytes: 0 });

  const ctrl = new AbortController();
  setJobController(albumId, ctrl);

  let doneCount = 0;
  let failedCount = 0;
  let totalAccumulatedBytes = 0;

  for (let i = 0; i < songs.length; i++) {
    if (ctrl.signal.aborted) break;
    const song = songs[i];
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
    } catch { /* ignore meta save errors */ }

    // Skip if already downloaded
    const existingBlob = await getAudioBlob(song.songId);
    if (existingBlob) {
      await new Promise(r => setTimeout(r, 400)); // UI delay to show progress
      totalAccumulatedBytes += existingBlob.size || (3.5 * 1024 * 1024);
      updateJob(albumId, { progressBytes: totalAccumulatedBytes });
      doneCount++;
      updateJob(albumId, { done: doneCount, failed: failedCount });
      continue;
    }

    const ok = await downloadAudioBlob(
      albumId,
      song.songId,
      song.youtubeVideoId,
      title,
      metadata.artistName || song.artist || "فنان غير معروف",
      (received, _total, delta) => {
        totalAccumulatedBytes += delta;
        updateJob(albumId, { progressBytes: totalAccumulatedBytes });
      },
      ctrl.signal
    );

    if (ctrl.signal.aborted) break;
    if (ok) doneCount++; else failedCount++;
    updateJob(albumId, { done: doneCount, failed: failedCount });
  }

  if (!ctrl.signal.aborted) {
    finishJob(albumId, failedCount === 0);
  }
  return failedCount === 0;
}
