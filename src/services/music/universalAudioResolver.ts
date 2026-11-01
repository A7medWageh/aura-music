/**
 * universalAudioResolver.ts
 * ─────────────────────────
 * Universal Audio Extraction Engine — Telegram-First Strategy
 *
 * Strategy Order:
 *   0.  Telegram Cloud Storage Cache (Neon DB, <10ms if cached)
 *   0.5 @L_10_BOT — primary download source via Telegram bot
 *       Runs in parallel with scrapers so we don't lose time.
 *   1.  JioSaavn 320kbps  +
 *   2.  Albumaty 320kbps  - Race in parallel, first win returns
 *   3.  SoundCloud (fallback)
 *   4.  Piped / youtubei.js
 *   5.  yt-dlp Worker (last resort)
 *
 * @L_10_BOT is the fastest path: the bot searches YouTube and delivers
 * the MP3 directly into the channel — instant 206 streaming afterward.
 */

import { resolveSaavnSong } from "./jiosaavn";
import { resolveAlbumatyStream } from "../scrapers/albumaty";
import { getCachedTelegramTrack, getTelegramDirectUrl, uploadAudioUrlToTelegram } from "../telegram/telegramStorage";
import { resolveViaMoonBot } from "../telegram/moonBotResolver";
import { findBestOfficialVideo, isStrictArtistMatch, BILINGUAL_ARTIST_MAP, extractSmartArtistAndTitle } from "./artistMatcher";
import { JANNAT_OLD_CLASSICS } from "@/data/jannatClassics";
import { ANGHAM_OLD_CLASSICS } from "@/data/anghamClassics";

export interface UniversalAudioResult {
  streamUrl: string;
  directPlay: boolean;
  source: "telegram" | "moonbot" | "jiosaavn" | "albumaty" | "soundcloud" | "youtube" | "piped";
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

/** Resolves with the FIRST non-null result; null only after every task has settled. */
function raceFirst<T>(tasks: Array<Promise<T | null>>): Promise<T | null> {
  return new Promise((resolve) => {
    let settled = 0;
    let winner: T | null = null;
    tasks.forEach((task) => {
      task
        .then((result) => {
          if (result && !winner) {
            winner = result;
            resolve(result);
          }
          if (++settled === tasks.length && !winner) resolve(null);
        })
        .catch(() => {
          if (++settled === tasks.length && !winner) resolve(null);
        });
    });
  });
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
      if (saavnTrack.durationSec && saavnTrack.durationSec < 60) {
        console.warn(`[AudioResolver] Rejecting JioSaavn snippet preview (${saavnTrack.durationSec}s) for "${title}"`);
        return null;
      }
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

/**
 * Strategy 0.5: @L_10_BOT — Primary Telegram music bot
 * Sends "تنزيل {title} {artist}" and waits for the bot's audio reply.
 * Returns Telegram stream URL ready for the player.
 */
async function tryMoonBot(
  title: string,
  artist: string | undefined,
  videoId: string | undefined,
  timeoutMs = 25000,
  forDownload = false
): Promise<UniversalAudioResult | null> {
  try {
    const moonResult = await withTimeout(
      resolveViaMoonBot({ title, artist, videoId, forDownload }),
      timeoutMs
    );
    if (moonResult?.streamUrl) {
      return {
        streamUrl: moonResult.streamUrl,
        directPlay: false,
        source: "moonbot",
        title: moonResult.title || title,
        artist: moonResult.artist || artist,
        durationSec: moonResult.durationSec,
        format: "mp3",
        mimeType: moonResult.mimeType || "audio/mpeg",
        videoId,
      };
    }
  } catch (e: any) {
    console.warn("[AudioResolver] MoonBot failed:", e.message);
  }
  return null;
}

async function extractArabicFromWeb(query: string): Promise<{ title?: string; artist?: string } | null> {
  try {
    const res = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const regex = /"title":{"runs":\[{"text":"([^"]+)"/g;
    let m;
    while ((m = regex.exec(html)) !== null) {
      if (m[1]) {
        const arabicBlocks = m[1].match(/[\u0600-\u06FF][\u0600-\u06FF\s0-9\-_–—]+/g);
        if (arabicBlocks) {
          for (const block of arabicBlocks) {
            const clean = block
              .replace(/فيديو كليب|كليب رسمي|الأغنية الرسمية|اغنية|أغنية|اشتركو|قناتي|حصريا|ريمكس|remix/gi, "")
              .trim();
            if (clean.length >= 3) {
              if (clean.includes("-") || clean.includes("–")) {
                const parts = clean.split(/[-–]/).map((p) => p.trim()).filter(Boolean);
                if (parts.length >= 2) {
                  return { artist: parts[0], title: parts[1] };
                }
              }
              return { title: clean };
            }
          }
        }
      }
    }
  } catch {}
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

  // Never upload short snippets to Telegram cache
  if (result.durationSec && result.durationSec < 60) {
    console.warn(`[AudioResolver] Skipping Telegram ingest for short snippet (${result.durationSec}s) for "${title}"`);
    return result;
  }

  if (
    !result.streamUrl.startsWith("http") ||
    result.streamUrl.includes("youtube.com") ||
    result.streamUrl.includes("youtu.be")
  ) {
    return result;
  }

  // The page warm can finish while this resolve is in flight; uploading again
  // would double-post the track to the channel and burn the worker's uplink.
  try {
    const already = videoId ? await getCachedTelegramTrack({ videoId }) : null;
    if (already?.tgFileId) {
      const reused: UniversalAudioResult = {
        ...result,
        streamUrl: `/api/telegram/stream?fileId=${encodeURIComponent(already.tgFileId)}&title=${encodeURIComponent(already.title || result.title || title)}`,
        directPlay: false,
        source: "telegram",
        mimeType: already.mimeType || result.mimeType,
        videoId: videoId || result.videoId,
      };
      memCache.set(cacheKey, { result: reused, expiresAt: Date.now() + CACHE_TTL_MS });
      return reused;
    }
  } catch {}

  try {
    const tgUpload = await uploadAudioUrlToTelegram({
      audioUrl: result.streamUrl,
      title: result.title || title,
      artist: result.artist || artist,
      duration: result.durationSec,
      videoId,
    });
    if (tgUpload?.fileId) {
      const tgResult: UniversalAudioResult = {
        streamUrl: `/api/telegram/stream?fileId=${encodeURIComponent(tgUpload.fileId)}&title=${encodeURIComponent(result.title || title)}`,
        directPlay: false,
        source: "telegram",
        title: result.title || title,
        artist: result.artist || artist,
        durationSec: result.durationSec,
        bitrate: result.bitrate || "320kbps",
        format: result.format || "mp3",
        mimeType: tgUpload.mimeType || result.mimeType || "audio/mpeg",
        videoId: videoId || result.videoId,
      };
      memCache.set(cacheKey, { result: tgResult, expiresAt: Date.now() + CACHE_TTL_MS });
      console.log(`[AudioResolver] Telegram CDN ingest complete for "${tgResult.title}"`);
      return tgResult;
    }
  } catch (err: any) {
    console.warn(`[AudioResolver] Telegram upload error: ${err.message}, falling back to direct stream`);
  }

  memCache.set(cacheKey, { result, expiresAt: Date.now() + CACHE_TTL_MS });
  return result;
}

export async function resolveUniversalAudio(params: {
  videoId?: string;
  title?: string;
  artist?: string;
  forDownload?: boolean;
  skipBot?: boolean;
}): Promise<UniversalAudioResult> {
  let { videoId, title = "", artist = "" } = params;

  title = cleanTitle(title);
  artist = cleanArtist(artist);

  const isGeneric =
    !artist ||
    artist === "فنان" ||
    artist === "فنان غير معروف" ||
    artist.toLowerCase().includes("unknown");

  // Safeguard: Match against Jannat Old Classics to ensure authentic official YouTube video ID
  const matchingJannat = JANNAT_OLD_CLASSICS.find((c) => {
    if (videoId && (c.songId === videoId || c.youtubeVideoId === videoId)) return true;
    const isJannatArtist = !artist || artist.includes("جنات") || artist.toLowerCase().includes("jannat");
    if (isJannatArtist && title) {
      const ct = cleanTitle(c.title).toLowerCase().replace(/\s+/g, "");
      const qt = cleanTitle(title).toLowerCase().replace(/\s+/g, "");
      return ct === qt || ct.includes(qt) || qt.includes(ct);
    }
    return false;
  });

  if (matchingJannat) {
    videoId = matchingJannat.youtubeVideoId;
    title = matchingJannat.title;
    artist = "جنات";
  }

  // Safeguard: Match against Angham Old Classics to ensure authentic official YouTube video ID
  const matchingAngham = ANGHAM_OLD_CLASSICS.find((c) => {
    if (videoId && (c.songId === videoId || c.youtubeVideoId === videoId)) return true;
    const isAnghamArtist = !artist || artist.includes("أنغام") || artist.toLowerCase().includes("angham");
    if (isAnghamArtist && title) {
      const ct = cleanTitle(c.title).toLowerCase().replace(/\s+/g, "");
      const qt = cleanTitle(title).toLowerCase().replace(/\s+/g, "");
      return ct === qt || ct.includes(qt) || qt.includes(ct);
    }
    return false;
  });

  if (matchingAngham) {
    videoId = matchingAngham.youtubeVideoId;
    title = matchingAngham.title;
    artist = "أنغام";
  }

  // A DB row keyed by videoId is only trustworthy when its artist matches the
  // clicked one — re-uploaded "same title, different audio" uploads (e.g. the
  // "Replica | Abyusif" bait video by another channel) otherwise play a
  // completely different song without any warning.
  const rowIsRightSong = (row: { videoId?: string; artist?: string; durationSec?: number }) => {
    if (matchingJannat && row) {
      // Validate expected duration for Jannat track (reject obvious snippets)
      if (matchingJannat.duration && row.durationSec) {
        const parts = matchingJannat.duration.split(":").map(Number);
        const expectedSec = parts[0] * 60 + parts[1];
        if (row.durationSec < 60 && expectedSec > 90) {
          console.warn(`[AudioResolver] Jannat snippet detected in DB row for "${title}": expected ${expectedSec}s, got ${row.durationSec}s`);
          return false;
        }
      }
      // Check artist is not Khaleeji (Hamada Majrashi, etc.)
      const rowArtist = (row.artist || "").toLowerCase();
      if (
        rowArtist.includes("حماده") ||
        rowArtist.includes("مجرشي") ||
        rowArtist.includes("majra") ||
        (rowArtist && !rowArtist.includes("جنات") && !rowArtist.includes("jannat"))
      ) {
        console.warn(`[AudioResolver] Jannat wrong artist detected in DB row: "${row.artist}" for "${title}"`);
        return false;
      }
      return true;
    }
    if (matchingAngham && row) {
      // Validate expected duration for Angham track (reject obvious snippets)
      if (matchingAngham.duration && row.durationSec) {
        const parts = matchingAngham.duration.split(":").map(Number);
        const expectedSec = parts[0] * 60 + parts[1];
        if (row.durationSec < 60 && expectedSec > 90) {
          console.warn(`[AudioResolver] Angham snippet detected in DB row for "${title}": expected ${expectedSec}s, got ${row.durationSec}s`);
          return false;
        }
      }
      const rowArtist = (row.artist || "").toLowerCase();
      if (rowArtist && !rowArtist.includes("أنغام") && !rowArtist.includes("angham")) {
        console.warn(`[AudioResolver] Angham wrong artist detected in DB row: "${row.artist}" for "${title}"`);
        return false;
      }
      return true;
    }
    // 1a rows share the clicked videoId (identity by id); rows found via the
    // title+artist branch already matched on title — so the artist check is
    // the remaining trust gap for polluted uploads.
    return !artist || isStrictArtistMatch(artist, row.artist || "");
  };

  // Strategy 0 (fast path): a known videoId is checked against the Telegram DB
  // BEFORE any YouTube oEmbed/getFile round-trips — those together cost ~7s
  // cold, which looked like "loading forever then 0:00" on first click.
  if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    try {
      const tgCached = await withTimeout(getCachedTelegramTrack({ videoId }), 4000);
      if (tgCached?.tgFileId && rowIsRightSong(tgCached)) {
        console.log(`[AudioResolver] Telegram DB HIT (fast path): "${tgCached.title}"`);
        return {
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
      } else if (tgCached?.tgFileId) {
        console.warn(
          `[AudioResolver] Wrong-upload guard: DB row for ${videoId} is "${tgCached.title} — ${tgCached.artist}", not "${title} — ${artist}"; ignoring`
        );
      }
    } catch (err: any) {
      console.warn("[AudioResolver] Fast Telegram DB lookup failed:", err.message);
    }
  }

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
    let tgCached = await withTimeout(
      getCachedTelegramTrack({ videoId, title, artist: effectiveArtist }),
      5000
    );
    // Identity gate: a row answering THIS click must either carry the clicked
    // videoId or have a title near-identical to the clicked one — otherwise a
    // polluted "same artist, different song" row would play the wrong track.
    if (tgCached?.tgFileId && tgCached.videoId && tgCached.videoId !== videoId) {
      const clean = (s: string) =>
        String(s || "").toLowerCase().replace(/[^a-z0-9\u0621-\u064A]+/g, "");
      const rt = clean(tgCached.title);
      const qt = clean(title);
      if (rt && qt && rt !== qt && !(rt.length > 3 && (rt.includes(qt) || qt.includes(rt)))) {
        console.warn(
          `[AudioResolver] Wrong-title guard: row "${tgCached.title}" (${tgCached.videoId}) is not "${title}" (${videoId})`
        );
        tgCached = null;
      }
    }
    if (tgCached?.tgFileId && !rowIsRightSong(tgCached)) {
      // The videoId row is a mislabeled upload — retry title-only so a
      // correctly tagged row (different videoId) can still serve the song.
      console.warn(
        `[AudioResolver] Wrong-upload guard (strategy 0): ignoring "${tgCached.artist}" row for ${videoId}`
      );
      tgCached = await withTimeout(
        getCachedTelegramTrack({ title, artist: effectiveArtist }),
        5000
      );
    }
    if (tgCached?.tgFileId) {
      const telegramUrl = await getTelegramDirectUrl(tgCached.tgFileId);
      if (telegramUrl) {
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
      console.warn(`[AudioResolver] Ignoring unavailable Telegram cache entry for "${title}"`);
    }
  } catch (err: any) {
    console.warn("[AudioResolver] Telegram DB lookup failed:", err.message);
  }

  const isArabicSong =
    /[\u0600-\u06FF]/.test(title) ||
    /[\u0600-\u06FF]/.test(artist) ||
    Boolean(oembedArabicTitle) ||
    Boolean(BILINGUAL_ARTIST_MAP[(artist || "").toLowerCase().trim()]) ||
    /amr diab|tamer hosny|hamaki|sherine|shereen|angham|bahaa sultan|wegz|marwan pablo|cairokee|hamza namira|ahmed saad|elissa|nancy ajram|george wassouf|tul8te|rubi|ruby|ashour|mounir|hakim|assala|fairuz|fayrouz|kalthoum|abdel halim|hossam habib|hossam|houssam|majid al mohandis|majed al mohandis|mohandis|mesh aawza|mish awza|tamally maak|nour el ein/i.test(
      `${title} ${artist}`
    );

  // Text-search providers, @L_10_BOT and SoundCloud are useless with no title —
  // they get posted an empty query, burn their full poll window and leave menu
  // spam in the channel. videoId-only requests go straight to the id-based path.
  const hasSearchTitle = Boolean(title.trim());

  let arabicResolvedTitle = oembedArabicTitle || null;
  let arabicResolvedArtist =
    (artist && BILINGUAL_ARTIST_MAP[artist.toLowerCase().trim()]) || effectiveArtist || null;

  if (hasSearchTitle && isArabicSong && (!arabicResolvedTitle || !/[\u0600-\u06FF]/.test(title))) {
    const webArabic = await extractArabicFromWeb(`${arabicResolvedArtist || artist || ""} ${title}`);
    if (webArabic?.title) {
      arabicResolvedTitle = webArabic.title;
      if (webArabic.artist && (!arabicResolvedArtist || !/[\u0600-\u06FF]/.test(arabicResolvedArtist))) {
        arabicResolvedArtist = webArabic.artist;
      }
      console.log(`[AudioResolver] Extracted Arabic identity: "${arabicResolvedTitle}" - "${arabicResolvedArtist}"`);
    }
  }

  const extracted = extractSmartArtistAndTitle(title, artist);
  const targetTitle = arabicResolvedTitle || oembedArabicTitle || extracted.title || title;
  const targetArtist = arabicResolvedArtist || extracted.artist || effectiveArtist;

  // ─────────────────────────────────────────────────────────────────
  // Tier 1 (PRIMARY SOURCE for downloads & high quality):
  // @wecibot (with @L_10_BOT secondary) via Telegram Cloud Storage.
  // When forDownload=true, @wecibot is ALWAYS the primary source,
  // and other sources act as backups only if the bot fails.
  // ─────────────────────────────────────────────────────────────────
  let winner: UniversalAudioResult | null = null;

  if (hasSearchTitle && !params.skipBot) {
    if (params.forDownload) {
      console.log(`[AudioResolver] 📥 Download request: using @wecibot as PRIMARY source for "${targetTitle}" by "${targetArtist}"...`);
      winner = await tryMoonBot(targetTitle, targetArtist, videoId, 25000, true);
      if (winner) {
        console.log(`[AudioResolver] ✅ @wecibot delivered download audio successfully for "${targetTitle}"!`);
        return winner;
      }
      console.warn(`[AudioResolver] ⚠️ @wecibot was unable to provide audio for "${targetTitle}". Switching to backup sources...`);
    } else {
      // For streaming (listening in player):
      // 1. Fast race between direct scrapers (Albumaty / JioSaavn) in 2.5s for instant playback
      if (isArabicSong) {
        winner = await raceFirst([
          tryAlbumaty(targetTitle, targetArtist, videoId, 2500),
          tryJioSaavn(title, effectiveArtist, videoId, 2500),
        ]);
      } else {
        winner = await raceFirst([
          tryJioSaavn(title, effectiveArtist, videoId, 2500),
          tryAlbumaty(title, effectiveArtist, videoId, 2500),
        ]);
      }

      // 2. If fast scrapers missed or had no result: use @wecibot (deduplicated & non-blocking)
      if (!winner) {
        winner = await tryMoonBot(targetTitle, targetArtist, videoId, 18000, false);
      }
      if (winner) return winner;
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Tier 2: Backup sources (مصادر احتياطية: Albumaty, JioSaavn, etc.)
  // ─────────────────────────────────────────────────────────────────
  if (!winner && hasSearchTitle) {
    if (isArabicSong) {
      const albumatyTitle = targetTitle;
      const albumatyArtist = targetArtist;

      winner = await raceFirst([
        tryAlbumaty(albumatyTitle, albumatyArtist, videoId, 8000),
        tryJioSaavn(title, effectiveArtist, videoId, 6000),
      ]);

      // Retry Albumaty with English title if Arabic one failed
      if (!winner && albumatyTitle !== title) {
        winner = await tryAlbumaty(title, effectiveArtist, videoId, 5000);
      }
    } else {
      winner = await raceFirst([
        tryJioSaavn(title, effectiveArtist, videoId, 6000),
        tryAlbumaty(title, effectiveArtist, videoId, 8000),
      ]);
    }
  }

  if (winner) {
    // moonbot results are already in Telegram — skip re-upload
    if (winner.source === "moonbot") return winner;
    if (!params.forDownload) {
      // ⚡ Instant Playback (Lightning-fast start):
      // Return stream URL immediately without waiting for full-file ingest.
      // Ingest to Telegram runs asynchronously in background for future caching.
      ingestToTelegram(winner, cacheKey, title, effectiveArtist, videoId).catch((err) =>
        console.warn(`[AudioResolver] Background ingest failed for "${winner?.title}":`, err.message)
      );
      return winner;
    }
    return await ingestToTelegram(winner, cacheKey, title, effectiveArtist, videoId);
  }

  // Strategy 3: SoundCloud fallback
  const scResult = hasSearchTitle ? await trySoundCloud(title, effectiveArtist, videoId, 6000) : null;
  if (scResult) {
    if (!params.forDownload) {
      ingestToTelegram(scResult, cacheKey, title, effectiveArtist, videoId).catch(() => {});
      return scResult;
    }
    return await ingestToTelegram(scResult, cacheKey, title, effectiveArtist, videoId);
  }


  // Strategy 4: Deep YouTube search then retry Albumaty/Saavn with Arabic title
  try {
    const { searchYouTube } = await import("@apis/youtubei.js");
    const q = `${effectiveArtist || ""} ${title}`.trim();
    if (!q) throw new Error("nothing to search");
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
          if (!params.forDownload) {
            ingestToTelegram(winner, cacheKey, title, effectiveArtist, videoId).catch(() => {});
            return winner;
          }
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
        if (!params.forDownload) {
          ingestToTelegram(pipedResult, cacheKey, title, effectiveArtist, videoId).catch(() => {});
          return pipedResult;
        }
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
        if (!params.forDownload) {
          ingestToTelegram(ytResult, cacheKey, title, effectiveArtist, videoId).catch(() => {});
          return ytResult;
        }
        return await ingestToTelegram(ytResult, cacheKey, title, effectiveArtist, videoId);
      }
    } catch {}
  }

  throw new Error(`لم نتمكن من العثور على رابط صوتي للأغنية: ${title || videoId}`);
}
