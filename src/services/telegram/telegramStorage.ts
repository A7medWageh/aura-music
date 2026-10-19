/**
 * telegramStorage.ts
 * ───────────────────
 * High-performance Telegram Audio Cloud Storage & CDN Engine.
 * 
 * Inspired by VenomMusic:
 * - Uses a Telegram Channel as an infinite, unbannable, lightning-fast MP3 database.
 * - Stores files permanently in Telegram's global CDN.
 * - Fast path: checks Neon PostgreSQL cache index first (<10ms).
 * - Fallback / ingestion: uploads newly resolved songs to the Telegram channel asynchronously.
 * - Full Range 206 streaming support for instant seek on iPhone / Safari / Web.
 */

import { query } from "@apis/neon";
import { isStrictArtistMatch, hasUnwantedTags } from "../music/artistMatcher";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8831422517:AAEXQFzQxzcyIKWI1WtfVh2XGzguGXAnCak";
const PRIMARY_CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || "-1004310944763";
const ALT_CHANNEL_ID = process.env.TELEGRAM_ALT_CHANNEL_ID || "-1003911765672";

export interface TelegramCachedTrack {
  id: number;
  videoId?: string;
  songId?: string;
  title: string;
  artist?: string;
  tgFileId: string;
  tgMessageId?: number;
  durationSec?: number;
  fileSize?: number;
  mimeType?: string;
  streamUrl?: string;
}

// In-process cache for getFile URL resolution (TTL: 1 hour)
const filePathCache = new Map<string, { path: string; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

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
 * 1. Check Neon PostgreSQL database for cached Telegram track
 */
export async function getCachedTelegramTrack(params: {
  videoId?: string;
  songId?: string;
  title?: string;
  artist?: string;
}): Promise<TelegramCachedTrack | null> {
  const { videoId, songId, title, artist } = params;

  try {
    // 1a. Search by videoId
    if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      const res = await query<any>(
        `SELECT id, video_id, song_id, title, artist, tg_file_id, tg_message_id, duration_sec, file_size, mime_type
         FROM telegram_audio_cache
         WHERE video_id = $1
         LIMIT 1`,
        [videoId]
      );
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          id: row.id,
          videoId: row.video_id,
          songId: row.song_id,
          title: row.title,
          artist: row.artist,
          tgFileId: row.tg_file_id,
          tgMessageId: row.tg_message_id ? Number(row.tg_message_id) : undefined,
          durationSec: row.duration_sec,
          fileSize: row.file_size ? Number(row.file_size) : undefined,
          mimeType: row.mime_type,
        };
      }
    }

    // 1b. Search by songId
    if (songId) {
      const res = await query<any>(
        `SELECT id, video_id, song_id, title, artist, tg_file_id, tg_message_id, duration_sec, file_size, mime_type
         FROM telegram_audio_cache
         WHERE song_id = $1
         LIMIT 1`,
        [songId]
      );
      if (res.rows.length > 0) {
        const row = res.rows[0];
        return {
          id: row.id,
          videoId: row.video_id,
          songId: row.song_id,
          title: row.title,
          artist: row.artist,
          tgFileId: row.tg_file_id,
          tgMessageId: row.tg_message_id ? Number(row.tg_message_id) : undefined,
          durationSec: row.duration_sec,
          fileSize: row.file_size ? Number(row.file_size) : undefined,
          mimeType: row.mime_type,
        };
      }
    }

    // 1c. Search by normalized title & artist
    if (title) {
      const normTitle = normalizeText(title);
      const normArtist = normalizeText(artist || "");

      const res = await query<any>(
        `SELECT id, video_id, song_id, title, artist, tg_file_id, tg_message_id, duration_sec, file_size, mime_type
         FROM telegram_audio_cache
         WHERE LOWER(title) = LOWER($1)
         LIMIT 5`,
        [title.trim()]
      );

      for (const row of res.rows) {
        // 1. Reject cached tracks that have unwanted tags (remix, cover, etc.) unless requested
        if (hasUnwantedTags(row.title, title)) {
          continue;
        }

        // 2. Strict artist check: if artist is provided, row must match requested artist!
        if (artist && !isStrictArtistMatch(artist, row.artist || "")) {
          continue;
        }

        return {
          id: row.id,
          videoId: row.video_id,
          songId: row.song_id,
          title: row.title,
          artist: row.artist,
          tgFileId: row.tg_file_id,
          tgMessageId: row.tg_message_id ? Number(row.tg_message_id) : undefined,
          durationSec: row.duration_sec,
          fileSize: row.file_size ? Number(row.file_size) : undefined,
          mimeType: row.mime_type,
        };
      }
    }
  } catch (err: any) {
    console.warn("[TelegramStorage] DB Cache lookup error:", err.message);
  }

  return null;
}

/**
 * 2. Get direct HTTP streaming URL from Telegram file_id
 */
export async function getTelegramDirectUrl(fileId: string): Promise<string | null> {
  if (!fileId || !BOT_TOKEN) return null;

  const cached = filePathCache.get(fileId);
  if (cached && cached.expiresAt > Date.now()) {
    return `https://api.telegram.org/file/bot${BOT_TOKEN}/${cached.path}`;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${encodeURIComponent(fileId)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.ok && data.result?.file_path) {
      const filePath = data.result.file_path;
      filePathCache.set(fileId, { path: filePath, expiresAt: Date.now() + CACHE_TTL_MS });
      return `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
    }
  } catch (err: any) {
    console.error("[TelegramStorage] getFile failed:", err.message);
  }

  return null;
}

/**
 * 3. Save uploaded track metadata to Neon DB cache table
 */
export async function saveTelegramCacheRecord(params: {
  videoId?: string;
  songId?: string;
  title: string;
  artist?: string;
  tgFileId: string;
  tgMessageId?: number;
  durationSec?: number;
  fileSize?: number;
  mimeType?: string;
}): Promise<void> {
  const { videoId, songId, title, artist, tgFileId, tgMessageId, durationSec, fileSize, mimeType } = params;

  try {
    await query(
      `INSERT INTO telegram_audio_cache (video_id, song_id, title, artist, tg_file_id, tg_message_id, duration_sec, file_size, mime_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (tg_file_id) DO NOTHING`,
      [
        videoId || null,
        songId || null,
        title.trim(),
        artist?.trim() || null,
        tgFileId,
        tgMessageId || null,
        durationSec || null,
        fileSize || null,
        mimeType || "audio/mpeg",
      ]
    );
    console.log(`[TelegramStorage] Cached "${title}" (file_id=${tgFileId}) in Neon DB!`);
  } catch (err: any) {
    console.warn("[TelegramStorage] DB Insert error:", err.message);
  }
}

/**
 * 4. Upload an audio URL directly to Telegram Storage Channel (Fast Serverless Upload with Buffer Fallback)
 */
export async function uploadAudioUrlToTelegram(params: {
  audioUrl: string;
  title: string;
  artist?: string;
  duration?: number;
  videoId?: string;
  songId?: string;
  thumbnailUrl?: string;
}): Promise<{ fileId: string; messageId: number; streamUrl: string } | null> {
  const { audioUrl, title, artist = "Aura Music", duration = 0, videoId, songId } = params;
  if (!BOT_TOKEN) return null;

  const targetChannels = [PRIMARY_CHANNEL_ID, ALT_CHANNEL_ID].filter(Boolean);

  for (const channelId of targetChannels) {
    try {
      console.log(`[TelegramStorage] Uploading "${title}" to Telegram channel ${channelId}...`);

      const bodyData = new URLSearchParams();
      bodyData.set("chat_id", channelId);
      bodyData.set("audio", audioUrl);
      bodyData.set("title", title);
      bodyData.set("performer", artist);
      if (duration > 0) bodyData.set("duration", Math.round(duration).toString());

      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: bodyData.toString(),
        signal: AbortSignal.timeout(15000),
      });

      const data = await res.json();
      const media = data.ok ? (data.result?.audio || data.result?.document) : null;

      if (media && media.file_id) {
        const fileId = media.file_id;
        const messageId = data.result.message_id;

        await saveTelegramCacheRecord({
          videoId,
          songId,
          title,
          artist,
          tgFileId: fileId,
          tgMessageId: messageId,
          durationSec: media.duration || duration,
          fileSize: media.file_size,
          mimeType: media.mime_type || "audio/mpeg",
        });

        const directUrl = await getTelegramDirectUrl(fileId);
        return {
          fileId,
          messageId,
          streamUrl: directUrl || audioUrl,
        };
      } else {
        console.warn(`[TelegramStorage] Direct URL upload failed for channel ${channelId}:`, data.description);

        // Fallback: If Telegram datacenter cannot fetch the URL directly, buffer it through our server
        if (audioUrl.startsWith("http")) {
          try {
            console.log(`[TelegramStorage] Attempting buffer upload fallback for "${title}"...`);
            const fetchHeaders: Record<string, string> = {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            };
            if (audioUrl.includes("albumaty.com")) fetchHeaders["Referer"] = "https://www.albumaty.com/";

            const audioRes = await fetch(audioUrl, { headers: fetchHeaders, signal: AbortSignal.timeout(15000) });
            if (audioRes.ok) {
              const arrayBuf = await audioRes.arrayBuffer();
              const buffer = Buffer.from(arrayBuf);
              if (buffer.length > 1000) {
                return await uploadAudioBufferToTelegram({
                  buffer,
                  filename: `${title.replace(/[\/\\?%*:|"<>]/g, "_")}.mp3`,
                  title,
                  artist,
                  duration,
                  videoId,
                  songId,
                });
              }
            }
          } catch (bufErr: any) {
            console.warn(`[TelegramStorage] Buffer upload fallback failed:`, bufErr.message);
          }
        }
      }
    } catch (err: any) {
      console.warn(`[TelegramStorage] Upload to ${channelId} failed:`, err.message);
    }
  }

  return null;
}

/**
 * 5. Upload Buffer / File to Telegram Storage Channel (for yt-dlp streams or local files)
 */
export async function uploadAudioBufferToTelegram(params: {
  buffer: Buffer;
  filename: string;
  title: string;
  artist?: string;
  duration?: number;
  videoId?: string;
  songId?: string;
}): Promise<{ fileId: string; messageId: number; streamUrl: string } | null> {
  const { buffer, filename, title, artist = "Aura Music", duration = 0, videoId, songId } = params;
  if (!BOT_TOKEN) return null;

  const targetChannels = [PRIMARY_CHANNEL_ID, ALT_CHANNEL_ID].filter(Boolean);

  for (const channelId of targetChannels) {
    try {
      const formData = new FormData();
      formData.set("chat_id", channelId);
      formData.set("title", title);
      formData.set("performer", artist);
      if (duration > 0) formData.set("duration", Math.round(duration).toString());

      const blob = new Blob([new Uint8Array(buffer)], { type: "audio/mpeg" });
      formData.set("audio", blob, filename.endsWith(".mp3") ? filename : `${filename}.mp3`);

      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, {
        method: "POST",
        body: formData,
        signal: AbortSignal.timeout(30000),
      });

      const data = await res.json();
      const media = data.ok ? (data.result?.audio || data.result?.document) : null;
      if (media && media.file_id) {
        const fileId = media.file_id;
        const messageId = data.result.message_id;

        await saveTelegramCacheRecord({
          videoId,
          songId,
          title,
          artist,
          tgFileId: fileId,
          tgMessageId: messageId,
          durationSec: media.duration || duration,
          fileSize: media.file_size,
          mimeType: media.mime_type || "audio/mpeg",
        });

        const directUrl = await getTelegramDirectUrl(fileId);
        return {
          fileId,
          messageId,
          streamUrl: directUrl || "",
        };
      }
    } catch (err: any) {
      console.warn(`[TelegramStorage] Buffer upload to ${channelId} failed:`, err.message);
    }
  }

  return null;
}
