/**
 * universalAudioResolver.ts
 * ─────────────────────────
 * Universal Audio Extraction Engine — Vercel-Optimized Parallel Race
 *
 * Strategy Order (parallel where possible):
 *   0. Telegram Cloud Storage Cache (Neon DB, <10ms if cached)
 *   1. JioSaavn 320kbps  +
 *   2. Albumaty 320kbps  - Race in parallel, first win returns
 *   3. SoundCloud (fallback)
 *   4. Telegram CDN upload completes before any stream URL is returned
 *
 * External source lookups are time-limited; playback waits for Telegram ingestion.
 */

import { resolveSaavnSong } from "./jiosaavn";
import { resolveAlbumatyStream } from "../scrapers/albumaty";
import { getCachedTelegramTrack, uploadAudioUrlToTelegram } from "../telegram/telegramStorage";
import { findBestOfficialVideo } from "./artistMatcher";

export interface UniversalAudioResult {
  streamUrl: string;
  directPlay: boolean;
  source: "telegram" | "jiosaavn" | "albumaty" | "soundcloud" | "youtube" | "piped";
  title?: string;
  artist?: string;
  durationSec?: number;
  bitrate?: string;
  format?: string;
  mimeType?: string;
  videoId?: string;
}

// In-process memory cache (< 5ms on repeated calls)
const memCache = new Map<string, { result: UniversalAudioResult; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function cleanTitle(str: string): string {
  return str
    .replace(/\(Official.*?\)/gi, "")
    .replace(/\[Official.*?\]/gi, "")
    .replace(/\(Audio.*?\)/gi, "")
    .replace(/\[Audio.*?\]/gi, "")
    .replace(/\(Lyric.*?\)/gi, "")
    .replace(/\[Lyric.*?\]/gi, "")
    .replace(/\|\s*Official.*$/gi, "")
    .replace(/فيديو كليب/g, "")
    .replace(/كليب رسمي/g, "")
    .replace(/الأغنية الرسمية/g, "")
    .trim();
}

function cleanArtist(str: string): string {
  if (!str) return "";
  return str
    .replace(/\s*-\s*topic\b/gi, "")
    .replace(/\s*vevo\b/gi, "")
    .replace(/\s*official\b/gi, "")
    .replace(/\s*channel\b/gi, "")
    .replace(/\s*records\b/gi, "")
    .replace(/\s*music\b/gi, "")
    .replace(/\s*قناة\s*رسمية/gi, "")
    .trim();
}

function withTimeout<T>(promise: Promise<T | null>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

async function fetchYouTubeOEmbed(videoId: string): Promise<{ title: string; author: string } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { signal: AbortSignal.timeout(3000) }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.title) {
      return { title: cleanTitle(data.title), author: cleanArtist(data.author_name || "") };
    }
  } catch {}
  return null;
}

async function tryJioSaavn(
  title: string,
  artist: string | undefined,
  videoId: string | undefined,
  timeoutMs = 6000
): Promise<UniversalAudioResult | null> {
  try {
    const saavnTrack = await withTimeout(resolveSaavnSong(title, artist), timeoutMs);
    if (saavnTrack?.streamUrl) {
      return {
        streamUrl: saavnTrack.streamUrl,
        directPlay: true,
        source: "jiosaavn",
        title: saavnTrack.title,
        artist: saavnTrack.artist || artist,
        durationSec: saavnTrack.durationSec,
        bitrate: saavnTrack.bitrate,
        format: "mp4/aac",
        videoId,
      };
    }
  } catch (e: any) {
    console.warn("[AudioResolver] JioSaavn failed:", e.message);
  }
  return null;
}

async function tryAlbumaty(
  title: string,
  artist: string | undefined,
  videoId: string | undefined,
  timeoutMs = 8000
): Promise<UniversalAudioResult | null> {
  try {
    const albumatyUrl = await withTimeout(resolveAlbumatyStream(title, artist || ""), timeoutMs);
    if (albumatyUrl) {
      return {
        streamUrl: albumatyUrl,
        directPlay: true,
        source: "albumaty",
        title,
        artist,
        format: "mp3",
        bitrate: "320kbps",
        videoId,
      };
    }
  } catch (e: any) {
    console.warn("[AudioResolver] Albumaty failed:", e.message);
  }
  return null;
}

async function trySoundCloud(
  title: string,
  artist: string | undefined,
  videoId: string | undefined,
  timeoutMs = 6000
): Promise<UniversalAudioResult | null> {
  try {
    const { resolveSoundCloudStream } = await import("../scrapers/soundcloud");
    const scUrl = await withTimeout(resolveSoundCloudStream(title, artist || ""), timeoutMs);
    if (scUrl && !scUrl.includes(".m3u8")) {
      return { streamUrl: scUrl, directPlay: true, source: "soundcloud", title, artist, videoId };
    }
  } catch (e: any) {
    console.warn("[AudioResolver] SoundCloud failed:", e.message);
  }
  return null;
}

async function ingestToTelegram(
  result: UniversalAudioResult,
  cacheKey: string,
  title: string,
  artist: string | undefined,
  videoId: string | undefined
): Promise<UniversalAudioResult> {
  if (result.source === "telegram") {
    memCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }

  if (!result.streamUrl.startsWith("http")) {
    throw new Error("Audio source cannot be stored in Telegram");
  }
  if (
    result.source === "youtube" ||
    result.streamUrl.includes("youtube.com") ||
    result.streamUrl.includes("youtu.be") ||
    result.streamUrl.includes("googlevideo.com")
  ) {
    throw new Error("YouTube streams must be downloaded by yt-dlp before Telegram storage");
  }

  const tgUpload = await uploadAudioUrlToTelegram({
    audioUrl: result.streamUrl,
    title: result.title || title,
    artist: result.artist || artist,
    duration: result.durationSec,
    videoId,
  });
  if (!tgUpload?.fileId) {
    throw new Error("Telegram storage upload failed; playback is blocked until the track is stored");
  }

  const tgResult: UniversalAudioResult = {
    streamUrl: `/api/telegram/stream?fileId=${encodeURIComponent(tgUpload.fileId)}&title=${encodeURIComponent(result.title || title)}`,
    directPlay: false,
    source: "telegram",
    title: result.title || title,
    artist: result.artist || artist,
    durationSec: result.durationSec,
    bitrate: result.bitrate || "320kbps",
    format: result.format || "mp3",
    mimeType: tgUpload.mimeType,
    videoId: videoId || result.videoId,
  };
  memCache.set(cacheKey, { result: tgResult, expiresAt: Date.now() + CACHE_TTL_MS });
  console.log(`[AudioResolver] Telegram CDN ingest complete for "${tgResult.title}"`);
  return tgResult;
}

export async function resolveUniversalAudio(params: {
  videoId?: string;
  title?: string;
  artist?: string;
  forDownload?: boolean;
}): Promise<UniversalAudioResult> {
  let { videoId, title = "", artist = "" } = params;

  title = cleanTitle(title);
  artist = cleanArtist(artist);

  const isGeneric =
    !artist ||
    artist === "فنان" ||
    artist === "فنان غير معروف" ||
    artist.toLowerCase().includes("unknown");

  let oembedArabicTitle: string | null = null;
  if (videoId && (!title || isGeneric || !/[\u0600-\u06FF]/.test(title))) {
    const oembed = await withTimeout(fetchYouTubeOEmbed(videoId), 3000);
    if (oembed) {
      if (!title) title = oembed.title;
      else if (/[\u0600-\u06FF]/.test(oembed.title)) oembedArabicTitle = oembed.title;
      if (isGeneric && oembed.author) artist = oembed.author;
    }
  }

  if (title.includes("-") && (!artist || artist === "فنان" || artist === "فنان غير معروف")) {
    const parts = title.split("-");
    if (parts[0].trim().length > 1 && parts[1].trim().length > 1) {
      artist = cleanArtist(parts[0].trim());
      title = cleanTitle(parts[1].trim());
    }
  }

  const effectiveArtist = isGeneric ? undefined : artist;
  const cacheKey = `v7_${videoId || ""}_${title}__${artist}`.toLowerCase();

  const memHit = memCache.get(cacheKey);
  if (memHit && memHit.expiresAt > Date.now()) {
    console.log(`[AudioResolver] Memory cache HIT for "${title}"`);
    return memHit.result;
  }

  // Strategy 0: Telegram DB cache (instant)
  try {
    const tgCached = await withTimeout(
      getCachedTelegramTrack({ videoId, title, artist: effectiveArtist }),
      5000
    );
    if (tgCached?.tgFileId) {
      console.log(`[AudioResolver] Telegram DB HIT: "${tgCached.title}"`);
      const result: UniversalAudioResult = {
        streamUrl: `/api/telegram/stream?fileId=${encodeURIComponent(tgCached.tgFileId)}&title=${encodeURIComponent(tgCached.title || title)}`,
        directPlay: false,
        source: "telegram",
        title: tgCached.title || title,
        artist: tgCached.artist || artist,
        durationSec: tgCached.durationSec,
        bitrate: "320kbps",
        format: "mp3",
        mimeType: tgCached.mimeType,
        videoId: tgCached.videoId || videoId,
      };
      memCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
      return result;
    }
  } catch (err: any) {
    console.warn("[AudioResolver] Telegram DB lookup failed:", err.message);
  }

  const isArabicSong =
    /[\u0600-\u06FF]/.test(title) ||
    /[\u0600-\u06FF]/.test(artist) ||
    Boolean(oembedArabicTitle) ||
    /amr diab|tamer hosny|hamaki|sherine|angham|bahaa sultan|wegz|marwan pablo|cairokee|hamza namira|ahmed saad|elissa|nancy ajram|george wassouf|tul8te|rubi|ruby|ashour|mounir|hakim|assala|fairuz|fayrouz|kalthoum|abdel halim/i.test(
      `${title} ${artist}`
    );

  // Strategy 1+2: Parallel race
  let winner: UniversalAudioResult | null = null;

  if (isArabicSong) {
    const albumatyTitle = oembedArabicTitle || title;
    const [albumatyRes, saavnRes] = await Promise.all([
      tryAlbumaty(albumatyTitle, effectiveArtist, videoId, 8000),
      tryJioSaavn(title, effectiveArtist, videoId, 6000),
    ]);
    winner = albumatyRes || saavnRes;
    if (!winner && oembedArabicTitle && oembedArabicTitle !== title) {
      winner = await tryAlbumaty(title, effectiveArtist, videoId, 5000);
    }
  } else {
    const [saavnRes, albumatyRes] = await Promise.all([
      tryJioSaavn(title, effectiveArtist, videoId, 6000),
      tryAlbumaty(title, effectiveArtist, videoId, 8000),
    ]);
    winner = saavnRes || albumatyRes;
  }

  if (winner) {
    return await ingestToTelegram(winner, cacheKey, title, effectiveArtist, videoId);
  }

  // Strategy 3: SoundCloud fallback
  const scResult = await trySoundCloud(title, effectiveArtist, videoId, 6000);
  if (scResult) {
    return await ingestToTelegram(scResult, cacheKey, title, effectiveArtist, videoId);
  }

  // Strategy 4: Deep YouTube search then retry Albumaty/Saavn with Arabic title
  try {
    const { searchYouTube } = await import("@apis/youtubei.js");
    const q = `${effectiveArtist || ""} ${title}`.trim();
    const searchRes = await withTimeout(searchYouTube(q), 4000);
    const songs = (searchRes as any)?.songs || (searchRes as any)?.videos || [];
    const candidates = songs.map((s: any) => ({
      youtubeVideoId: s.youtubeVideoId || s.songId || s.id,
      title: s.title || "",
      artist: s.artist || s.author?.name || "",
      channel: s.author?.name || s.channel || "",
      durationSec: s.duration?.seconds || s.durationSec,
    }));
    const bestVid = findBestOfficialVideo(candidates, title, artist);
    if (bestVid) {
      videoId = bestVid;
      const candidate = candidates.find((c: any) => c.youtubeVideoId === bestVid);
      const candidateTitle = candidate?.title || title;
      if (/[\u0600-\u06FF]/.test(candidateTitle)) {
        const [a2, s2] = await Promise.all([
          tryAlbumaty(candidateTitle, effectiveArtist, videoId, 6000),
          tryJioSaavn(candidateTitle, effectiveArtist, videoId, 5000),
        ]);
        winner = a2 || s2;
        if (winner) {
          return await ingestToTelegram(winner, cacheKey, title, effectiveArtist, videoId);
        }
      }
    }
  } catch (e: any) {
    console.warn("[AudioResolver] YouTube search failed:", e.message);
  }

  // Strategy 5: Piped parallel + youtubei.js
  if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    const pipedInstances = [
      "https://cf.piped.video",
      "https://api.piped.private.coffee",
      "https://pipedapi.adminforge.de",
    ];
    try {
      const pipedData = await Promise.any(
        pipedInstances.map(async (inst) => {
          const res = await fetch(`${inst}/streams/${videoId}`, { signal: AbortSignal.timeout(3000) });
          if (!res.ok) throw new Error(`${inst} ${res.status}`);
          const data = await res.json();
          const audio = (data?.audioStreams || []).find((s: any) => s.url);
          if (!audio?.url) throw new Error("No audio");
          return { url: audio.url, title: data?.title, duration: data?.duration };
        })
      );
      if (pipedData?.url) {
        const pipedResult: UniversalAudioResult = {
          streamUrl: pipedData.url,
          directPlay: false,
          source: "piped",
          title: pipedData.title || title,
          artist,
          durationSec: pipedData.duration,
          videoId,
        };
        return await ingestToTelegram(pipedResult, cacheKey, title, effectiveArtist, videoId);
      }
    } catch {}

    try {
      const { resolveStream } = await import("@apis/youtubei.js");
      const streamUrl = await withTimeout(resolveStream(videoId), 4000);
      if (streamUrl) {
        const ytResult: UniversalAudioResult = {
          streamUrl,
          directPlay: false,
          source: "youtube",
          title,
          artist,
          videoId,
        };
        return await ingestToTelegram(ytResult, cacheKey, title, effectiveArtist, videoId);
      }
    } catch {}
  }

  throw new Error(`لم نتمكن من العثور على رابط صوتي للأغنية: ${title || videoId}`);
}
