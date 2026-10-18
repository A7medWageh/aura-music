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

export interface UniversalAudioResult {
  streamUrl: string;
  directPlay: boolean;
  source: "jiosaavn" | "albumaty" | "soundcloud" | "youtube" | "piped";
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
        author: res.data.author_name || "",
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

  title = cleanTitle(title);
  artist = artist.trim();

  // Enrich query with YouTube oEmbed if videoId is provided and title is missing or lacks Arabic letters
  if (videoId && (!title || !/[\u0600-\u06FF]/.test(title))) {
    const oembed = await fetchYouTubeOEmbed(videoId);
    if (oembed) {
      if (!title || /[\u0600-\u06FF]/.test(oembed.title)) {
        title = cleanTitle(oembed.title);
      }
      if (!artist && oembed.author) {
        artist = oembed.author.trim();
      }
    }
  }

  // If title still lacks Arabic characters, do a fast yt-search check to uncover official bilingual/Arabic title
  let searchArabicTitle = "";
  let searchArabicArtist = "";
  if (artist || title) {
    try {
      const yts = require("yt-search");
      const ytLookup = await yts(`${artist} ${title}`.trim());
      const arabicVid = ytLookup?.videos?.slice(0, 8).find((v: any) => /[\u0600-\u06FF]/.test(v.title));
      if (arabicVid?.title) {
        console.log(`[AudioResolver] Discovered Arabic title via yt-search: "${arabicVid.title}"`);
        const cleanArabic = cleanTitle(arabicVid.title);
        const parts = cleanArabic.split(/[/|\-–—]/).map((s: string) => s.trim()).filter((s: string) => /[\u0600-\u06FF]/.test(s));
        if (parts.length >= 2) {
          searchArabicArtist = parts[0];
          searchArabicTitle = parts[1];
        } else if (parts.length === 1) {
          searchArabicTitle = parts[0];
        }
        if ((!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) && arabicVid.videoId) {
          videoId = arabicVid.videoId;
        }
      }
    } catch {}
  }

  const queryTitle = searchArabicTitle || title;
  const queryArtist = searchArabicArtist || artist;
  const isArabic = /[\u0600-\u06FF]/.test(queryTitle) || /[\u0600-\u06FF]/.test(queryArtist);

  const cacheKey = `${videoId || ""}_${title}__${artist}_${forDownload ? "dl" : "st"}`.toLowerCase();
  const cached = memCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  console.log(`[AudioResolver] Resolving: title="${title}" (arabic="${queryTitle}") artist="${artist}" (arabic="${queryArtist}") videoId="${videoId || ""}"`);

  // ── Strategy 1: Albumaty (Highest Quality 320kbps Arabic Audio) ──────────────
  // Always query Albumaty (it has built-in transliteration mapping for "Ya Ta3ebny", "Fi Eih", etc.)
  if (queryTitle || title) {
    try {
      const albumatyUrl = await resolveAlbumatyStream(queryTitle || title, queryArtist || artist);
      if (albumatyUrl) {
        const result: UniversalAudioResult = {
          streamUrl: albumatyUrl,
          directPlay: true,
          source: "albumaty",
          title: queryTitle || title,
          artist: queryArtist || artist,
          format: "mp3",
          bitrate: "320kbps",
          videoId,
        };
        memCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      }
    } catch (e: any) {
      console.warn("[AudioResolver] Albumaty failed:", e.message);
    }
  }

  // ── Strategy 2: If local yt-dlp is available and videoId is provided, USE YOUTUBE DIRECTLY! ──
  // When running locally with yt-dlp, streaming directly from YouTube stdout is instant and 100% accurate.
  const { isYtDlpAvailable } = await import("@apis/yt-dlp");
  if (isYtDlpAvailable() && videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    console.log(`[AudioResolver] Local yt-dlp available. Using exact YouTube videoId=${videoId} for "${title}" by "${artist}"`);
    const result: UniversalAudioResult = {
      streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
      directPlay: false,
      source: "youtube",
      title: queryTitle || title,
      artist: queryArtist || artist,
      format: "mp4/aac",
      videoId,
    };
    memCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
  }

  // ── Strategy 3: JioSaavn (320kbps Cloudflare CDN streams for both Arabic & International) ──
  if (title || queryTitle) {
    try {
      let saavnTrack = await resolveSaavnSong(queryTitle || title, queryArtist || artist);
      if (!saavnTrack && title && title !== queryTitle) {
        saavnTrack = await resolveSaavnSong(title, artist);
      }
      if (saavnTrack && saavnTrack.streamUrl) {
        const result: UniversalAudioResult = {
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
        memCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      }
    } catch (e: any) {
      console.warn("[AudioResolver] JioSaavn failed:", e.message);
    }
  }

  // ── Strategy 4: SoundCloud (Direct progressive MP3 / AAC streams) ─────────────
  if (title) {
    try {
      const scUrl = await resolveSoundCloudStream(title, artist);
      if (scUrl && !scUrl.includes(".m3u8") && !scUrl.includes("playlist.m3u8")) {
        const result: UniversalAudioResult = {
          streamUrl: scUrl,
          directPlay: true,
          source: "soundcloud",
          title,
          artist,
          videoId,
        };
        memCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
        return result;
      }
    } catch (e: any) {
      console.warn("[AudioResolver] SoundCloud failed:", e.message);
    }
  }

  // ── Strategy 5: Exact YouTube Video fallback (for Remote Worker tunnel proxy) ──
  if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    console.log(`[AudioResolver] Exact YouTube videoId=${videoId} queued for "${title}" by "${artist}"`);
    const result: UniversalAudioResult = {
      streamUrl: `https://www.youtube.com/watch?v=${videoId}`,
      directPlay: false,
      source: "youtube",
      title: queryTitle || title,
      artist: queryArtist || artist,
      format: "mp4/aac",
      videoId,
    };
    memCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
    return result;
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
      const candidate = searchRes.songs?.[0];
      const fallbackVid = candidate?.youtubeVideoId || candidate?.songId;

      if (fallbackVid && fallbackVid !== videoId) {
        // 7a. If candidate revealed Arabic title, check Albumaty first for 320kbps MP3
        if (candidate.title && /[\u0600-\u06FF]/.test(candidate.title)) {
          try {
            const albumatyUrl = await resolveAlbumatyStream(candidate.title, artist);
            if (albumatyUrl) {
              const result: UniversalAudioResult = {
                streamUrl: albumatyUrl,
                directPlay: true,
                source: "albumaty",
                title: candidate.title,
                artist,
                format: "mp3",
                bitrate: "320kbps",
              };
              memCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
              return result;
            }
          } catch {}
        }

        // 7b. Try JioSaavn with candidate title
        if (candidate.title) {
          try {
            const saavnTrack = await resolveSaavnSong(candidate.title, artist);
            if (saavnTrack?.streamUrl) {
              const result: UniversalAudioResult = {
                streamUrl: saavnTrack.streamUrl,
                directPlay: true,
                source: "jiosaavn",
                title: saavnTrack.title,
                artist: saavnTrack.artist || artist,
                durationSec: saavnTrack.durationSec,
                bitrate: saavnTrack.bitrate,
                format: "mp4/aac",
              };
              memCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
              return result;
            }
          } catch {}
        }

        // 7c. Try SoundCloud with candidate title
        if (candidate.title) {
          try {
            const scUrl = await resolveSoundCloudStream(candidate.title, artist);
            if (scUrl && !scUrl.includes(".m3u8") && !scUrl.includes("playlist.m3u8")) {
              const result: UniversalAudioResult = {
                streamUrl: scUrl,
                directPlay: true,
                source: "soundcloud",
                title: candidate.title,
                artist,
              };
              memCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
              return result;
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
