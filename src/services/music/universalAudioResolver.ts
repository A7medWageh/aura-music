/**
 * universalAudioResolver.ts
 * ─────────────────────────
 * Universal Audio Extraction Engine (Inspired by VenomMusic)
 *
 * Multi-Platform Extraction:
 *   1. JioSaavn (320kbps high-quality direct stream, Cloudflare CDN, no rate limits)
 *   2. Albumaty (Direct Arabic MP3 files, 100% Arabic accuracy)
 *   3. SoundCloud (Direct Progressive MP3 / AAC / HLS)
 *   4. YouTube (InnerTube / oEmbed resolution + Piped fallback)
 *
 * Full support for:
 *   - Instant Range 206 chunk-by-chunk streaming
 *   - Offline download of complete intact MP3 files
 *   - Vercel Serverless deployment without datacenter IP blocks
 */

import axios from "axios";
import { resolveSaavnSong } from "./jiosaavn";
import { resolveAlbumatyStream } from "../scrapers/albumaty";
import { resolveSoundCloudStream } from "../scrapers/soundcloud";
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
  videoId?: string;
}

// In-process cache to make repeated calls instantaneous (<5ms)
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

function normalizeText(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, "ا")
    .replace(/[ة]/g, "ه")
    .replace(/[ى]/g, "ي")
    .replace(/[^a-z0-9\u0621-\u064A\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Quick oEmbed query to get video title and channel when only videoId is available
 */
async function fetchYouTubeOEmbed(videoId: string): Promise<{ title: string; author: string } | null> {
  try {
    const res = await axios.get(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      { timeout: 3000 }
    );
    if (res.data?.title) {
      return {
        title: cleanTitle(res.data.title),
        author: cleanArtist(res.data.author_name || ""),
      };
    }
  } catch {
    // oEmbed unavailable or video private
  }
  return null;
}

export async function resolveUniversalAudio(params: {
  videoId?: string;
  title?: string;
  artist?: string;
  forDownload?: boolean;
}): Promise<UniversalAudioResult> {
  let { videoId, title = "", artist = "", forDownload = false } = params;

  const originalCleanTitle = cleanTitle(title);
  const originalCleanArtist = cleanArtist(artist);
  title = originalCleanTitle;
  artist = originalCleanArtist;

  // Enrich query with YouTube oEmbed if videoId is provided and (title is missing, artist is missing/generic, or title lacks Arabic letters)
  let oembedArabicTitle: string | null = null;
  const isGeneric = !artist || artist === "فنان" || artist === "فنان غير معروف" || artist.toLowerCase().includes("unknown");
  if (videoId && (!title || isGeneric || !/[\u0600-\u06FF]/.test(title))) {
    const oembed = await fetchYouTubeOEmbed(videoId);
    if (oembed) {
      if (!title) {
        title = cleanTitle(oembed.title);
      } else if (/[\u0600-\u06FF]/.test(oembed.title)) {
        oembedArabicTitle = cleanTitle(oembed.title);
      }
      if (isGeneric && oembed.author) {
        artist = cleanArtist(oembed.author);
      }
    }
  }

  // If title has "Artist - Song", extract both if artist is missing
  if (title.includes("-") && (!artist || artist === "فنان" || artist === "فنان غير معروف")) {
    const parts = title.split("-");
    if (parts[0].trim().length > 1 && parts[1].trim().length > 1) {
      artist = cleanArtist(parts[0].trim());
      title = cleanTitle(parts[1].trim());
    }
  }

  const cacheKey = `v6_${videoId || ""}_${title}__${artist}`.toLowerCase();
  const cached = memCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  const ingestToTelegramAndReturn = async (result: UniversalAudioResult): Promise<UniversalAudioResult> => {
    // If the stream is an external direct audio link (Albumaty, JioSaavn, SoundCloud, etc.), ingest synchronously into Telegram Cloud CDN!
    if (
      result.streamUrl &&
      result.source !== "telegram" &&
      result.streamUrl.startsWith("http") &&
      !result.streamUrl.includes("youtube.com")
    ) {
      try {
        console.log(`[AudioResolver] Ingesting "${result.title || title}" into Telegram Cloud CDN...`);
        const tgUpload = await Promise.race([
          uploadAudioUrlToTelegram({
            audioUrl: result.streamUrl,
            title: result.title || title,
            artist: result.artist || artist,
            duration: result.durationSec,
            videoId,
          }),
          new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Telegram ingestion timeout")), 4500)),
        ]);

        if (tgUpload && tgUpload.fileId) {
          console.log(`[AudioResolver] ⚡ Successfully ingested to Telegram: ${tgUpload.fileId}`);
          const tgResult: UniversalAudioResult = {
            streamUrl: `/api/telegram/stream?fileId=${encodeURIComponent(tgUpload.fileId)}&title=${encodeURIComponent(result.title || title)}`,
            directPlay: false,
            source: "telegram",
            title: result.title || title,
            artist: result.artist || artist,
            durationSec: result.durationSec,
            bitrate: "320kbps",
            format: "mp3",
            videoId: videoId || result.videoId,
          };
          memCache.set(cacheKey, { result: tgResult, expiresAt: Date.now() + CACHE_TTL_MS });
          return tgResult;
        }
      } catch (tgErr: any) {
        console.warn("[AudioResolver] Telegram ingestion notice (falling back to direct):", tgErr.message);
      }
    }

    memCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  };

  // ── Strategy 0: Telegram Cloud Storage Cache (Unbannable, Instant Range 206) ──
  try {
    const tgCached = await getCachedTelegramTrack({ videoId, title, artist });
    if (tgCached && tgCached.tgFileId) {
      console.log(`[AudioResolver] ⚡ Telegram Cloud Cache HIT: "${tgCached.title}" (${tgCached.tgFileId})`);
      const result: UniversalAudioResult = {
        streamUrl: `/api/telegram/stream?fileId=${encodeURIComponent(tgCached.tgFileId)}&title=${encodeURIComponent(tgCached.title || title)}`,
        directPlay: false,
        source: "telegram",
        title: tgCached.title || title,
        artist: tgCached.artist || artist,
        durationSec: tgCached.durationSec,
        bitrate: "320kbps",
        format: "mp3",
        videoId: tgCached.videoId || videoId,
      };
      memCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
      return result;
    }
  } catch (tgErr: any) {
    console.warn("[AudioResolver] Telegram cache lookup failed:", tgErr.message);
  }

  const isArabicSong =
    /[\u0600-\u06FF]/.test(title) ||
    /[\u0600-\u06FF]/.test(artist) ||
    Boolean(oembedArabicTitle) ||
    /amr diab|tamer hosny|hamaki|sherine|angham|bahaa sultan|wegz|marwan pablo|cairokee|hamza namira|ahmed saad|elissa|nancy ajram|george wassouf|tul8te|rubi|ruby|ashour|mounir|hakim|assala|fairuz|fayrouz|kalthoum|abdel halim/i.test(`${title} ${artist}`);

  // ── Strategy 1: Albumaty First for Arabic Music (Authentic Studio-Master 320kbps MP3) ──────
  if (isArabicSong && (title || oembedArabicTitle)) {
    try {
      let albumatyUrl = await resolveAlbumatyStream(title, artist);
      if (!albumatyUrl && oembedArabicTitle) {
        albumatyUrl = await resolveAlbumatyStream(oembedArabicTitle, artist);
      }
      if (!albumatyUrl && originalCleanTitle && originalCleanTitle !== title) {
        albumatyUrl = await resolveAlbumatyStream(originalCleanTitle, artist);
      }
      if (albumatyUrl) {
        return await ingestToTelegramAndReturn({
          streamUrl: albumatyUrl,
          directPlay: true,
          source: "albumaty",
          title,
          artist,
          format: "mp3",
          bitrate: "320kbps",
          videoId,
        });
      }
    } catch (e: any) {
      console.warn("[AudioResolver] Albumaty failed:", e.message);
    }
  }

  // ── Strategy 2: JioSaavn (320kbps Cloudflare CDN streams - strict title & artist match) ──
  if (title) {
    try {
      const saavnTrack = await resolveSaavnSong(title, artist);
      if (saavnTrack && saavnTrack.streamUrl) {
        return await ingestToTelegramAndReturn({
          streamUrl: saavnTrack.streamUrl,
          directPlay: true,
          source: "jiosaavn",
          title: saavnTrack.title,
          artist: saavnTrack.artist || artist,
          durationSec: saavnTrack.durationSec,
          bitrate: saavnTrack.bitrate,
          format: "mp4/aac",
          videoId,
        });
      }
    } catch (e: any) {
      console.warn("[AudioResolver] JioSaavn failed:", e.message);
    }
  }

  // ── Strategy 2.5: Albumaty Fallback for non-Arabic designated queries ──────
  if (!isArabicSong && (title || oembedArabicTitle)) {
    try {
      let albumatyUrl = await resolveAlbumatyStream(title, artist);
      if (albumatyUrl) {
        return await ingestToTelegramAndReturn({
          streamUrl: albumatyUrl,
          directPlay: true,
          source: "albumaty",
          title,
          artist,
          format: "mp3",
          bitrate: "320kbps",
          videoId,
        });
      }
    } catch (e: any) {
      console.warn("[AudioResolver] Albumaty secondary failed:", e.message);
    }
  }

  // ── Strategy 3: SoundCloud (Direct progressive streams) ─────────────
  if (title) {
    try {
      const scUrl = await resolveSoundCloudStream(title, artist);
      if (scUrl && !scUrl.includes(".m3u8") && !scUrl.includes("playlist.m3u8")) {
        return await ingestToTelegramAndReturn({
          streamUrl: scUrl,
          directPlay: true,
          source: "soundcloud",
          title,
          artist,
          videoId,
        });
      }
    } catch (e: any) {
      console.warn("[AudioResolver] SoundCloud failed:", e.message);
    }
  }

  // ── Strategy 3.5: Deep Official YouTube Video Resolution ───────────────────
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    try {
      const { searchYouTube } = await import("@apis/youtubei.js");
      const officialQ = `${artist} ${title} Official`.trim();
      const standardQ = `${title} ${artist}`.trim();

      const [res1, res2] = await Promise.all([
        searchYouTube(officialQ).catch(() => null),
        searchYouTube(standardQ).catch(() => null),
      ]);

      const candidates: any[] = [];
      for (const res of [res1, res2]) {
        const list = res?.songs || (res as any)?.videos || [];
        for (const item of list) {
          const v = item?.youtubeVideoId || item?.videoId || item?.id;
          if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
            candidates.push({
              youtubeVideoId: v,
              title: item.title || "",
              artist: item.artist || item.author?.name || "",
              channel: item.author?.name || item.channel || "",
              durationSec: item.duration?.seconds || item.durationSec,
            });
          }
        }
      }

      const bestOfficialVid = findBestOfficialVideo(candidates, title, artist);
      if (bestOfficialVid) {
        console.log(`[AudioResolver] 🎯 Deep YouTube Search locked official video: ${bestOfficialVid} for "${title}" - "${artist}"`);
        videoId = bestOfficialVid;
      }
    } catch (e: any) {
      console.warn("[AudioResolver] Deep YouTube search failed:", e.message);
    }
  }

  // ── Strategy 4: Local yt-dlp or Remote Worker tunnel proxy ──
  if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    try {
      const { isYtDlpAvailable } = await import("@apis/yt-dlp");
      if (isYtDlpAvailable() || process.env.REMOTE_STREAM_WORKER) {
        const result: UniversalAudioResult = {
          streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
          directPlay: false,
          source: "youtube",
          title,
          artist,
          format: "mp4/aac",
          videoId,
        };
        memCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      }
    } catch {}
  }

  // ── Strategy 5: In-house yt-dlp (Direct extraction inspired by VenomMusic) ──────
  if (videoId) {
    try {
      const { resolveAudioStream } = await import("@apis/yt-dlp");
      const ytDlpUrl = await Promise.race([
        resolveAudioStream(videoId),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("yt-dlp timeout")), 7000)),
      ]);
      if (ytDlpUrl) {
        const result: UniversalAudioResult = {
          streamUrl: ytDlpUrl,
          directPlay: false,
          source: "youtube",
          title,
          artist,
          format: "mp3",
        };
        memCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      }
    } catch (e: any) {
      // yt-dlp failed or timed out — proceed immediately
    }
  }

  // ── Strategy 6: Fast Parallel Piped Fallback ────────────────────────────────
  if (videoId) {
    const pipedInstances = [
      "https://cf.piped.video",
      "https://api.piped.private.coffee",
      "https://pipedapi.adminforge.de",
      "https://piped.video",
    ];

    try {
      const pipedData = await Promise.any(
        pipedInstances.map(async (inst) => {
          const res = await axios.get(`${inst}/streams/${videoId}`, { timeout: 2500 });
          const audio = (res.data?.audioStreams || []).find((s: any) => s.url);
          if (audio?.url) {
            return {
              url: audio.url,
              title: res.data?.title,
              duration: res.data?.duration,
            };
          }
          throw new Error("No audio stream");
        })
      );

      if (pipedData?.url) {
        const result: UniversalAudioResult = {
          streamUrl: pipedData.url,
          directPlay: false,
          source: "piped",
          title: pipedData.title || title,
          durationSec: pipedData.duration,
        };
        memCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      }
    } catch {}

    // Strategy 6.5: youtubei.js deciphering with strict 3.5s timeout
    try {
      const { resolveStream } = await import("@apis/youtubei.js");
      const streamUrl = await Promise.race([
        resolveStream(videoId),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("resolveStream timeout")), 3500)),
      ]);
      if (streamUrl) {
        const result: UniversalAudioResult = {
          streamUrl,
          directPlay: false,
          source: "youtube",
          title,
          artist,
        };
        memCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      }
    } catch {}
  }

  // ── Strategy 7: Intelligent Search Recovery (When videoId is unavailable/stale) ─
  if (title) {
    try {
      const { searchYouTube } = await import("@apis/youtubei.js");
      const searchQuery = `${artist} ${title}`.trim();
      const searchRes = await Promise.race([
        searchYouTube(searchQuery),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error("search timeout")), 3000)),
      ]);
      const songs = searchRes?.songs || [];
      const candidates = songs.map((s: any) => ({
        youtubeVideoId: s.youtubeVideoId || s.songId,
        title: s.title || "",
        artist: s.artist || s.author?.name || "",
        channel: s.author?.name || s.channel || "",
        durationSec: s.duration?.seconds,
      }));
      const fallbackVid = findBestOfficialVideo(candidates, title, artist);
      const candidate = songs.find((s: any) => (s.youtubeVideoId || s.songId) === fallbackVid) || songs[0];

      if (fallbackVid && fallbackVid !== videoId) {
        // 7a. If candidate revealed Arabic title, check Albumaty first for 320kbps MP3
        if (candidate.title && /[\u0600-\u06FF]/.test(candidate.title)) {
          try {
            const albumatyUrl = await resolveAlbumatyStream(candidate.title, artist);
            if (albumatyUrl) {
              return await ingestToTelegramAndReturn({
                streamUrl: albumatyUrl,
                directPlay: true,
                source: "albumaty",
                title: candidate.title,
                artist,
                format: "mp3",
                bitrate: "320kbps",
              });
            }
          } catch {}
        }

        // 7b. Try JioSaavn with candidate title
        if (candidate.title) {
          try {
            const saavnTrack = await resolveSaavnSong(candidate.title, artist);
            if (saavnTrack?.streamUrl) {
              return await ingestToTelegramAndReturn({
                streamUrl: saavnTrack.streamUrl,
                directPlay: true,
                source: "jiosaavn",
                title: saavnTrack.title,
                artist: saavnTrack.artist || artist,
                durationSec: saavnTrack.durationSec,
                bitrate: saavnTrack.bitrate,
                format: "mp4/aac",
              });
            }
          } catch {}
        }

        // 7c. Try SoundCloud with candidate title
        if (candidate.title) {
          try {
            const scUrl = await resolveSoundCloudStream(candidate.title, artist);
            if (scUrl && !scUrl.includes(".m3u8") && !scUrl.includes("playlist.m3u8")) {
              return await ingestToTelegramAndReturn({
                streamUrl: scUrl,
                directPlay: true,
                source: "soundcloud",
                title: candidate.title,
                artist,
              });
            }
          } catch {}
        }
      }
    } catch (e: any) {
      console.warn("[AudioResolver] Search recovery failed:", e.message);
    }
  }

  throw new Error(`لم نتمكن من العثور على رابط صوتي للأغنية: ${title || videoId}`);
}
