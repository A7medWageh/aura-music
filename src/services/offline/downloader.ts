import { saveSongMeta, storeAudioBlob, storeLyrics, getAudioBlob, getAllOfflineSongs, fetchImageAsDataUrl, detectAudioMimeType } from "@/offline/indexedDbCache";
import { startJob, updateJob, finishJob, setJobController, isJobPaused } from "@/state/downloadStore";
import { toAbsoluteApiUrl } from "@/utils/apiBase";
import { JANNAT_OLD_CLASSICS } from "@/data/jannatClassics";
import { ANGHAM_OLD_CLASSICS } from "@/data/anghamClassics";

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

export function cleanArtistAndTitle(rawTitle?: string, rawArtist?: string): { title: string; artist: string } {
  let title = (rawTitle || "").trim();
  let artist = (rawArtist || "").trim();

  const isGeneric =
    !artist ||
    artist === "فنان" ||
    artist === "فنان غير معروف" ||
    artist === "غير معروف" ||
    artist.toLowerCase().includes("unknown");

  if (isGeneric && title.includes("-")) {
    const parts = title.split("-");
    if (parts[0].trim().length > 1 && parts[1].trim().length > 1) {
      artist = parts[0].trim();
      title = parts[1].trim();
    }
  }

  if (
    artist === "فنان" ||
    artist === "فنان غير معروف" ||
    artist === "غير معروف" ||
    artist.toLowerCase().includes("unknown")
  ) {
    artist = "";
  }

  return { title: title || "أغنية محفوظة", artist };
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
    if (title && title !== "أغنية محفوظة") params.set("title", title);
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
          // Retrieve from isolated cache and store in IndexedDB
          const cacheName = `aura-bg-${reg.id}`;
          caches.open(cacheName).then(async (cache) => {
            const matches = await cache.matchAll();
            let cachedResp: Response | undefined = matches[0] || (await cache.match(url));
            if (!cachedResp) {
              const legacyCache = await caches.open("aura-bg-downloads").catch(() => null);
              if (legacyCache) {
                cachedResp = await legacyCache.match(url);
              }
            }

            if (cachedResp) {
              const blob = await cachedResp.blob();
              await storeAudioBlob(songId, blob);
              try { await caches.delete(cacheName); } catch {}
              try { await caches.delete("aura-bg-downloads"); } catch {}
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
      if (title && title !== "أغنية محفوظة") params.set("title", title);
      if (artist) params.set("artist", artist);
      params.set("proxy", "true");
      params.set("download", "true");
      params.set("t", Date.now().toString());

      const apiUrl = toAbsoluteApiUrl(`/api/ytdownload?${params.toString()}`);
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
      if (!onProgress) {
        updateJob(jobId, { totalBytes: contentLength, progressBytes: 1 });
      }

      let blob: Blob;
      let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
      try {
        if (res.body && typeof res.body.getReader === "function") {
          reader = res.body.getReader();
        }
      } catch {
        reader = null;
      }

      if (reader) {
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
          // Update at least every 60ms or on completion for smooth live byte counter
          if (now - lastReport > 60 || receivedBytes >= contentLength) {
            lastReport = now;
            const currentTotal = Math.max(contentLength, receivedBytes);
            if (onProgress) {
              onProgress(receivedBytes, currentTotal, delta);
            } else {
              updateJob(jobId, { progressBytes: receivedBytes, totalBytes: currentTotal });
            }
          }
        }

        if (receivedBytes < 1000) throw new Error("الملف الصوتي فارغ أو تم رفض الوصول");

        if (!onProgress) {
          updateJob(jobId, { progressBytes: receivedBytes, totalBytes: receivedBytes });
        }

        let mimeType = res.headers.get("content-type");
        if (chunks[0]) {
          mimeType = detectAudioMimeType(chunks[0], mimeType || "audio/mp4");
        } else if (!mimeType || mimeType === "application/octet-stream") {
          mimeType = "audio/mp4";
        }
        blob = new Blob(chunks as any, { type: mimeType });
        chunks.length = 0; // Release chunk references immediately to free memory
      } else {
        // Fallback for iOS / Safari / CapacitorHttp where body.getReader() is not available
        blob = await res.blob();
        if (blob.size < 1000) throw new Error("الملف الصوتي فارغ أو تم رفض الوصول");
        if (onProgress) {
          onProgress(blob.size, blob.size, blob.size);
        } else {
          updateJob(jobId, { progressBytes: blob.size, totalBytes: blob.size });
        }
      }

      await storeAudioBlob(songId, blob);
      blob = null as any; // Free blob reference immediately
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
  const { title: rawTitle, artist: rawArtist } = cleanArtistAndTitle(metadata?.title, metadata?.artist);
  const displayArtist = rawArtist || "فنان غير معروف";

  try {
    const isJannat =
      displayArtist.includes("جنات") ||
      displayArtist.toLowerCase().includes("jannat") ||
      metadata?.artist?.includes("جنات") ||
      metadata?.artist?.toLowerCase().includes("jannat");

    const jannatClassic = isJannat
      ? JANNAT_OLD_CLASSICS.find((c) => {
          if (songId && (c.songId === songId || c.youtubeVideoId === songId)) return true;
          if (videoId && (c.songId === videoId || c.youtubeVideoId === videoId)) return true;
          const ct = c.title.trim().toLowerCase().replace(/\s+/g, "");
          const qt = rawTitle.trim().toLowerCase().replace(/\s+/g, "");
          return ct === qt || ct.includes(qt) || qt.includes(ct);
        })
      : null;

    const isAngham =
      displayArtist.includes("أنغام") ||
      displayArtist.toLowerCase().includes("angham") ||
      metadata?.artist?.includes("أنغام") ||
      metadata?.artist?.toLowerCase().includes("angham");

    const anghamClassic = isAngham
      ? ANGHAM_OLD_CLASSICS.find((c) => {
          if (songId && (c.songId === songId || c.youtubeVideoId === songId)) return true;
          if (videoId && (c.songId === videoId || c.youtubeVideoId === videoId)) return true;
          const ct = c.title.trim().toLowerCase().replace(/\s+/g, "");
          const qt = rawTitle.trim().toLowerCase().replace(/\s+/g, "");
          return ct === qt || ct.includes(qt) || qt.includes(ct);
        })
      : null;

    const classic = jannatClassic || anghamClassic;

    const effectiveTitle = classic ? classic.title : rawTitle;
    const effectiveArtist = jannatClassic ? "جنات" : anghamClassic ? "أنغام" : displayArtist;
    const effectiveVideoId = classic ? classic.youtubeVideoId : (videoId || songId);
    const effectiveAlbum = classic ? classic.album : metadata?.albumName;

    const allSongs = await getAllOfflineSongs();
    const smartFolder = jannatClassic
      ? "جنات"
      : anghamClassic
      ? "أنغام"
      : getSmartFolderName(metadata?.folderName || effectiveArtist, allSongs, effectiveTitle);

    // Pre-cache thumbnail as offline dataUrl so image loads with 0 network
    const rawThumb = (classic && classic.thumbnailUrl) || metadata?.thumbnailUrl;
    const cachedArt = rawThumb
      ? await fetchImageAsDataUrl(rawThumb).catch(() => rawThumb)
      : undefined;

    await saveSongMeta({
      songId,
      youtubeVideoId: effectiveVideoId,
      title: effectiveTitle,
      artist: effectiveArtist,
      thumbnailUrl: cachedArt || rawThumb,
      albumId: classic ? classic.album : metadata?.albumId,
      albumName: effectiveAlbum,
      folderName: smartFolder,
    });

    startJob(songId, effectiveTitle, "song", 1);
    updateJob(songId, { currentSong: effectiveTitle, totalBytes: 3.5 * 1024 * 1024, progressBytes: 1 });

    const ctrl = new AbortController();
    setJobController(songId, ctrl);
    const ok = await downloadAudioBlob(songId, songId, effectiveVideoId, effectiveTitle, effectiveArtist, undefined, ctrl.signal);
    if (ctrl.signal.aborted) return false;
    if (ok) {
      // Sanity check: verify the downloaded blob is not a snippet or corrupt Khaleeji track
      const blob = await getAudioBlob(songId);
      if (blob && (blob.size === 5634752 || blob.size === 8419726 || blob.size === 6736640 || blob.size === 6677312 || blob.size < 600000)) {
        console.warn(`[Downloader] Purging invalid audio blob (size=${blob.size}) for "${effectiveTitle}"`);
        const { deleteAudioBlobOnly } = await import("@/offline/indexedDbCache");
        await deleteAudioBlobOnly(songId);
        updateJob(songId, { done: 0, failed: 1 });
        finishJob(songId, false);
        return false;
      }

      updateJob(songId, { done: 1, failed: 0 });
      // Asynchronously pre-cache lyrics for offline use
      fetch(`/api/lyrics?trackName=${encodeURIComponent(effectiveTitle)}&artistName=${encodeURIComponent(effectiveArtist)}&videoId=${effectiveVideoId}`)
        .then(r => r.json())
        .then(async (d) => {
          if (d.lyrics || d.syncedLyrics) {
            await storeLyrics(songId, { lyrics: d.lyrics, syncedLyrics: d.syncedLyrics });
            console.log(`[Downloader] Offline lyrics saved for "${effectiveTitle}"`);
          }
        })
        .catch(() => {});
    } else {
      updateJob(songId, { done: 0, failed: 1 });
    }
    finishJob(songId, ok);
    return ok;
  } catch (err) {
    console.error(`[Library] Failed to save "${rawTitle}":`, err);
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

  // Pre-cache album cover as dataUrl once for the whole album
  const cachedCover = metadata.coverUrl
    ? await fetchImageAsDataUrl(metadata.coverUrl).catch(() => metadata.coverUrl)
    : undefined;

  const estimatedSongBytes = 3.5 * 1024 * 1024;
  const estimatedTotalAlbumBytes = total * estimatedSongBytes;

  startJob(albumId, albumName, "album", total);
  updateJob(albumId, { 
    totalBytes: estimatedTotalAlbumBytes, 
    progressBytes: 0,
    currentSong: `جاري بدء التحميل (1/${total})...`
  });

  const ctrl = new AbortController();
  setJobController(albumId, ctrl);

  let doneCount = 0;
  let failedCount = 0;
  let totalAccumulatedBytes = 0;

  for (let i = 0; i < songs.length; i++) {
    if (ctrl.signal.aborted) break;
    const song = songs[i];
    const title = song.title || `أغنية ${i + 1}`;
    updateJob(albumId, { currentSong: `(${i + 1}/${total}) ${title}` });

    try {
      await saveSongMeta({
        songId: song.songId,
        youtubeVideoId: song.youtubeVideoId,
        title,
        artist: metadata.artistName || song.artist || "فنان غير معروف",
        thumbnailUrl: cachedCover || song.thumbnailUrl || metadata.coverUrl,
        albumId,
        albumName,
        folderName: smartFolder,
      });
    } catch { /* ignore meta save errors */ }

    // Skip if already downloaded
    const existingBlob = await getAudioBlob(song.songId);
    if (existingBlob) {
      totalAccumulatedBytes += existingBlob.size || estimatedSongBytes;
      doneCount++;
      updateJob(albumId, { 
        progressBytes: totalAccumulatedBytes,
        done: doneCount, 
        failed: failedCount 
      });
      continue;
    }

    let songReceivedBytes = 0;
    const ok = await downloadAudioBlob(
      albumId,
      song.songId,
      song.youtubeVideoId,
      title,
      metadata.artistName || song.artist || "فنان غير معروف",
      (received, _total, delta) => {
        totalAccumulatedBytes += delta;
        songReceivedBytes = received;
        const remainingSongs = Math.max(0, total - (i + 1));
        const dynamicAlbumTotal = Math.max(estimatedTotalAlbumBytes, totalAccumulatedBytes + remainingSongs * estimatedSongBytes);
        updateJob(albumId, { 
          progressBytes: totalAccumulatedBytes,
          totalBytes: dynamicAlbumTotal,
          currentSong: `(${i + 1}/${total}) ${title} (${(songReceivedBytes / (1024 * 1024)).toFixed(1)} MB)`
        });
      },
      ctrl.signal
    );

    if (ctrl.signal.aborted) break;
    if (ok) doneCount++; else failedCount++;
    updateJob(albumId, { done: doneCount, failed: failedCount, progressBytes: totalAccumulatedBytes });

    // Brief 80ms pause to let GC reclaim memory
    await new Promise(r => setTimeout(r, 80));
  }

  if (!ctrl.signal.aborted) {
    finishJob(albumId, failedCount === 0);
  }
  return failedCount === 0;
}
