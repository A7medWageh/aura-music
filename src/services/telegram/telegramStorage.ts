/**
 * telegramStorage.ts
 * ───────────────────
 * High-performance Telegram Audio Cloud Storage & CDN Engine.
 * 
 * Inspired by VenomMusic:
 * - Uses a Telegram Channel as an infinite, unbannable, lightning-fast MP3 database.
 * - Stores files permanently in Telegram's global CDN.
 * - Fast path: checks Neon PostgreSQL cache index first (<10ms).
 * - Fallback / ingestion: uploads resolved songs to the Telegram channel before playback.
 * - Full Range 206 streaming support for instant seek on iPhone / Safari / Web.
 */

import { query } from "@apis/neon";
import { isStrictArtistMatch, hasUnwantedTags } from "../music/artistMatcher";

const BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN || "8831422517:AAEXQFzQxzcyIKWI1WtfVh2XGzguGXAnCak";

function getTargetChannels(): string[] {
  const primary = process.env.TELEGRAM_CHANNEL_ID || "-1004310944763";
  const alt = process.env.TELEGRAM_ALT_CHANNEL_ID || "-1003911765672";
  return Array.from(
    new Set(
      [primary, alt]
        .map((channelId) => channelId?.trim())
        .filter((channelId): channelId is string => Boolean(channelId))
    )
  );
}

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

function isValidCacheRow(row: any, requestedArtist?: string): boolean {
  if (!row) return false;
  // 1. Duration guard: reject short previews (< 45s) or broken 0s DASH audio
  if (row.duration_sec !== undefined && row.duration_sec !== null) {
    if (row.duration_sec > 0 && row.duration_sec < 45) {
      return false;
    }
    if (row.duration_sec === 0 && (!row.file_size || Number(row.file_size) < 500000)) {
      return false;
    }
  }
  // 2. File size / Khaleeji guard
  if (row.file_size && (row.file_size === 8419726 || row.file_size === 5634752 || row.file_size === 6736640 || row.file_size === 6677312)) {
    return false;
  }
  const rowArtist = (row.artist || "").toLowerCase();
  const rowTitle = (row.title || "").toLowerCase();
  if (
    rowArtist.includes("حماده") ||
    rowArtist.includes("مجرشي") ||
    rowArtist.includes("majra") ||
    rowTitle.includes("مجرشي") ||
    rowTitle.includes("حماده مجرشي") ||
    rowTitle.includes("شيلة") ||
    rowTitle.includes("شيلات") ||
    rowTitle.includes("جلسة عود")
  ) {
    return false;
  }
  // 3. If requested artist is Jannat or Angham, reject if row says otherwise
  if (requestedArtist) {
    const isReqJannat = requestedArtist.includes("جنات") || requestedArtist.toLowerCase().includes("jannat");
    if (isReqJannat && rowArtist && !rowArtist.includes("جنات") && !rowArtist.includes("jannat") && !rowArtist.includes("rotana") && !rowArtist.includes("aura")) {
      return false;
    }
    const isReqAngham = requestedArtist.includes("أنغام") || requestedArtist.toLowerCase().includes("angham");
    if (isReqAngham && rowArtist && !rowArtist.includes("أنغام") && !rowArtist.includes("angham") && !rowArtist.includes("rotana") && !rowArtist.includes("aura")) {
      return false;
    }
    // Specific artist mismatch guard (e.g. Ahmed Hussein vs Donia El Alfy cover)
    const cleanReq = requestedArtist.toLowerCase().trim();
    if (cleanReq.includes("احمد حسين") && (rowArtist.includes("دنيا") || rowTitle.includes("دنيا"))) {
      return false;
    }
    if (cleanReq.includes("دنيا") && (rowArtist.includes("احمد حسين") || (rowTitle.includes("احمد حسين") && !rowTitle.includes("دنيا")))) {
      return false;
    }
  }
  return true;
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
    // 1a. Search by videoId (prefer full-length, highest duration rows)
    if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      const targetVids = [videoId];
      if (videoId === "reUnnLjh5f8") targetVids.push("_RHIECWv728");
      if (videoId === "_RHIECWv728") targetVids.push("reUnnLjh5f8");

      const res = await query<any>(
        `SELECT id, video_id, song_id, title, artist, tg_file_id, tg_message_id, duration_sec, file_size, mime_type
         FROM telegram_audio_cache
         WHERE video_id = ANY($1::text[])
         ORDER BY COALESCE(duration_sec, 0) DESC, id DESC
         LIMIT 5`,
        [targetVids]
      );
      for (const row of res.rows) {
        if (isValidCacheRow(row, artist)) {
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
    }

    // 1b. Search by songId
    if (songId) {
      const res = await query<any>(
        `SELECT id, video_id, song_id, title, artist, tg_file_id, tg_message_id, duration_sec, file_size, mime_type
         FROM telegram_audio_cache
         WHERE song_id = $1
         ORDER BY COALESCE(duration_sec, 0) DESC, id DESC
         LIMIT 5`,
        [songId]
      );
      for (const row of res.rows) {
        if (isValidCacheRow(row, artist)) {
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
    }

    // 1c. Search by title & artist (bilingual & multi-variant)
    if (title) {
      const cleanT = title.trim();
      const titleVariants = new Set<string>();
      titleVariants.add(cleanT);

      const stripped = cleanT.replace(/\(.*?\)/g, "").replace(/\[.*?\]/g, "").replace(/\|.*$/g, "").trim();
      if (stripped) titleVariants.add(stripped);

      // Common Arabic / Franco cross-language dictionary
      const lower = cleanT.toLowerCase();
      if (lower.includes("el bakht") || cleanT.includes("البخت")) {
        titleVariants.add("El Bakht");
        titleVariants.add("البخت");
      }
      if (lower.includes("kalam eneih") || cleanT.includes("كلام عينيه")) {
        titleVariants.add("Kalam Eneih");
        titleVariants.add("كلام عينيه");
      }
      if (lower.includes("tamally maak") || cleanT.includes("تملي معاك")) {
        titleVariants.add("Tamally Maak");
        titleVariants.add("تملي معاك");
      }

      // If title has 'تتر مسلسل <اسم المسلسل> - <اسم الاغنية>'
      const seriesMatch = cleanT.match(/^تتر\s+مسلسل\s+[^-–—|]+\s*[-–—|]\s*(.+)$/i);
      if (seriesMatch) {
        titleVariants.add(seriesMatch[1].trim());
      }

      // If title has dashes, extract individual components
      if (cleanT.includes("-") || cleanT.includes("–") || cleanT.includes("—")) {
        const parts = cleanT.split(/[-–—]/).map((p) => p.trim()).filter(Boolean);
        for (const p of parts) {
          if (p.length >= 3 && !/مسلسل|تتر|أغنية|كليب|فيديو/i.test(p)) {
            titleVariants.add(p);
          }
        }
      }

      const whereParts: string[] = [];
      const sqlParams: any[] = [];
      let pIdx = 1;

      for (const t of titleVariants) {
        whereParts.push(`title = $${pIdx} OR title ILIKE $${pIdx + 1}`);
        sqlParams.push(t, `%${t}%`);
        pIdx += 2;
      }

      // Multi-word token matching across all title variants (matches manually uploaded MP3s without series prefix)
      for (const variant of titleVariants) {
        const words = normalizeText(variant)
          .split(/\s+/)
          .filter((w) => w.length >= 3 && !["اغنية", "كليب", "تتر", "فيديو", "رسمي", "مسلسل"].includes(w));
        if (words.length >= 2) {
          const wordClauses = words.map((w) => {
            const idx = pIdx++;
            sqlParams.push(`%${w}%`);
            return `title ILIKE $${idx}`;
          });
          whereParts.push(`(${wordClauses.join(" AND ")})`);
        }
      }

      const res = await query<any>(
        `SELECT id, video_id, song_id, title, artist, tg_file_id, tg_message_id, duration_sec, file_size, mime_type
         FROM telegram_audio_cache
         WHERE ${whereParts.join(" OR ")}
         ORDER BY COALESCE(duration_sec, 0) DESC, id DESC
         LIMIT 25`,
        sqlParams
      );

      // Smart sort:
      // 1. If artist specified, candidate tracks matching that artist (in artist or in title) rank highest.
      // 2. Penalize street wedding recordings / extreme fluff.
      // 3. Prioritize standard song durations (120-400s) over 11+ min marathon concert recordings.
      const normArtist = artist && artist !== "فنان غير معروف" && artist !== "Aura Music" ? normalizeText(artist) : "";
      const sortedRows = [...res.rows].sort((a, b) => {
        if (normArtist) {
          const aTitleNorm = normalizeText(a.title || "");
          const bTitleNorm = normalizeText(b.title || "");
          const aArtistNorm = normalizeText(a.artist || "");
          const bArtistNorm = normalizeText(b.artist || "");

          const aArtistMatch =
            isStrictArtistMatch(artist || "", a.artist || "") ||
            aTitleNorm.includes(normArtist) ||
            aArtistNorm.includes(normArtist);
          const bArtistMatch =
            isStrictArtistMatch(artist || "", b.artist || "") ||
            bTitleNorm.includes(normArtist) ||
            bArtistNorm.includes(normArtist);

          if (aArtistMatch && !bArtistMatch) return -1;
          if (!aArtistMatch && bArtistMatch) return 1;
        }

        const aFluff = /ترند|حظ|بونبوناية|فرح|فرحة|حفلة|ريمكس|شعبي جديد|مهرجان|افجر احساس/i.test(a.title || "");
        const bFluff = /ترند|حظ|بونبوناية|فرح|فرحة|حفلة|ريمكس|شعبي جديد|مهرجان|افجر احساس/i.test(b.title || "");
        if (!aFluff && bFluff) return -1;
        if (aFluff && !bFluff) return 1;

        // Normal song duration preference
        const aNormDur = (a.duration_sec || 0) >= 120 && (a.duration_sec || 0) <= 420;
        const bNormDur = (b.duration_sec || 0) >= 120 && (b.duration_sec || 0) <= 420;
        if (aNormDur && !bNormDur) return -1;
        if (!aNormDur && bNormDur) return 1;

        return (a.title?.length || 0) - (b.title?.length || 0);
      });

      for (const row of sortedRows) {
        if (!isValidCacheRow(row, artist)) {
          continue;
        }

        // 1. Reject cached tracks that have unwanted tags (remix, cover, etc.) unless requested
        if (hasUnwantedTags(row.title, title)) {
          continue;
        }

        // 2. Strict artist check: if artist is provided, row must match requested artist,
        // or row.title must contain the artist, or row.artist must be a distributor channel!
        if (normArtist) {
          const normRowArtist = normalizeText(row.artist || "");
          const normRowTitle = normalizeText(row.title || "");

          const artistMatches =
            isStrictArtistMatch(artist || "", row.artist || "") ||
            (normRowArtist && normArtist.includes(normRowArtist)) ||
            (normRowArtist && normRowArtist.includes(normArtist));

          const titleContainsArtist =
            normRowTitle.includes(normArtist) ||
            normArtist.split(/\s+/).filter((w) => w.length > 2).every((w) => normRowTitle.includes(w));

          const isGenericUploader =
            !normRowArtist ||
            normRowArtist === "aura music" ||
            normRowArtist === "naghmaty" ||
            /naghmaty|نغماتي|weci|shaabeyat|mazzika|rotana|nogoum|channel|music|records|group|entertainment|production|media/i.test(row.artist || "");

          const isKnownProductionChannel = /رمضان|العدل|mbc|cbc|dmc|فن|سينرجي|synergy|art\b/i.test(normRowArtist);

          if (!artistMatches && !titleContainsArtist && !isGenericUploader && !isKnownProductionChannel) {
            continue;
          }
        }

        if (videoId && !row.video_id) {
          query("UPDATE telegram_audio_cache SET video_id = $1 WHERE id = $2", [videoId, row.id]).catch(() => {});
        }

        return {
          id: row.id,
          videoId: row.video_id || videoId,
          songId: row.song_id || songId,
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
    const data = await res.json();
    if (data.ok && data.result?.file_path) {
      const filePath = data.result.file_path;
      filePathCache.set(fileId, { path: filePath, expiresAt: Date.now() + CACHE_TTL_MS });
      return `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;
    }
    console.warn("[TelegramStorage] Telegram getFile rejected the file:", data.description || `HTTP ${res.status}`);
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
       ON CONFLICT (tg_file_id) DO UPDATE SET
         video_id = COALESCE(EXCLUDED.video_id, telegram_audio_cache.video_id),
         song_id = COALESCE(EXCLUDED.song_id, telegram_audio_cache.song_id),
         title = CASE WHEN EXCLUDED.title IS NOT NULL AND EXCLUDED.title != '' THEN EXCLUDED.title ELSE telegram_audio_cache.title END,
         artist = CASE WHEN EXCLUDED.artist IS NOT NULL AND EXCLUDED.artist != 'Aura Music' AND EXCLUDED.artist NOT ILIKE '%naghmat%' THEN EXCLUDED.artist ELSE telegram_audio_cache.artist END,
         duration_sec = COALESCE(EXCLUDED.duration_sec, telegram_audio_cache.duration_sec),
         file_size = COALESCE(EXCLUDED.file_size, telegram_audio_cache.file_size)`,
      [
        videoId || null,
        songId || null,
        title.trim(),
        artist?.trim() || null,
        tgFileId,
        tgMessageId || null,
        Number.isFinite(durationSec) ? Math.round(durationSec as number) : null,
        Number.isFinite(fileSize) ? Math.round(fileSize as number) : null,
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
type TelegramUpload = { fileId: string; messageId: number; streamUrl: string; mimeType?: string } | null;

// Two lanes (page warm + live resolve) can reach the uploader for the same
// track at the same time; only the first may post it to the channel.
const uploadFlight = new Map<string, Promise<TelegramUpload>>();

function withUploadFlight<T extends TelegramUpload>(videoId: string | undefined, run: () => Promise<T>): Promise<T> {
  if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) return run();
  const live = uploadFlight.get(videoId);
  if (live) return live as Promise<T>;
  const flight = run().finally(() => uploadFlight.delete(videoId)) as Promise<TelegramUpload>;
  uploadFlight.set(videoId, flight);
  return flight as Promise<T>;
}

export async function uploadAudioUrlToTelegram(params: {
  audioUrl: string;
  title: string;
  artist?: string;
  duration?: number;
  videoId?: string;
  songId?: string;
  thumbnailUrl?: string;
}): Promise<{ fileId: string; messageId: number; streamUrl: string; mimeType?: string } | null> {
  return withUploadFlight(params.videoId, () => uploadAudioUrlOnce(params));
}

async function uploadAudioUrlOnce(params: {
  audioUrl: string;
  title: string;
  artist?: string;
  duration?: number;
  videoId?: string;
  songId?: string;
  thumbnailUrl?: string;
}): Promise<{ fileId: string; messageId: number; streamUrl: string; mimeType?: string } | null> {
  const { audioUrl, title, artist = "Aura Music", duration = 0, videoId, songId } = params;
  const targetChannels = getTargetChannels();
  if (!BOT_TOKEN || targetChannels.length === 0) {
    console.error("[TelegramStorage] Upload requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID");
    return null;
  }

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
          mimeType: media.mime_type || undefined,
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

            const audioRes = await fetch(audioUrl, { headers: fetchHeaders, signal: AbortSignal.timeout(45000) });
            if (audioRes.ok) {
              const contentType = audioRes.headers.get("content-type") || "audio/mpeg";
              const contentLength = Number(audioRes.headers.get("content-length") || 0);
              if (contentLength > 50 * 1024 * 1024) {
                console.warn("[TelegramStorage] Audio exceeds Telegram's 50 MB bot upload limit");
                continue;
              }
              const arrayBuf = await audioRes.arrayBuffer();
              const buffer = Buffer.from(arrayBuf);
              if (buffer.length > 50 * 1024 * 1024) {
                console.warn("[TelegramStorage] Audio exceeds Telegram's 50 MB bot upload limit");
                continue;
              }
              if (buffer.length > 1000) {
                const extension = contentType.includes("mp4") ? "m4a" : "mp3";
                return await uploadAudioBufferToTelegram({
                  buffer,
                  filename: `${title.replace(/[\/\\?%*:|"<>]/g, "_")}.${extension}`,
                  title,
                  mimeType: contentType.startsWith("audio/") ? contentType : "audio/mpeg",
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
  mimeType?: string;
  artist?: string;
  duration?: number;
  videoId?: string;
  songId?: string;
}): Promise<{ fileId: string; messageId: number; streamUrl: string; mimeType?: string } | null> {
  return withUploadFlight(params.videoId, () => uploadAudioBufferOnce(params));
}

async function uploadAudioBufferOnce(params: {
  buffer: Buffer;
  filename: string;
  title: string;
  mimeType?: string;
  artist?: string;
  duration?: number;
  videoId?: string;
  songId?: string;
}): Promise<{ fileId: string; messageId: number; streamUrl: string; mimeType?: string } | null> {
  const { buffer, filename, title, mimeType = "audio/mpeg", artist = "Aura Music", duration = 0, videoId, songId } = params;
  const targetChannels = getTargetChannels();
  if (!BOT_TOKEN || targetChannels.length === 0) {
    console.error("[TelegramStorage] Upload requires TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID");
    return null;
  }
  if (buffer.length === 0 || buffer.length > 50 * 1024 * 1024) {
    console.error(`[TelegramStorage] Invalid Telegram audio size: ${buffer.length} bytes`);
    return null;
  }

  for (const channelId of targetChannels) {
    try {
      const formData = new FormData();
      formData.set("chat_id", channelId);
      formData.set("title", title);
      formData.set("performer", artist);
      if (duration > 0) formData.set("duration", Math.round(duration).toString());

      const blob = new Blob([new Uint8Array(buffer)], { type: mimeType });
      const audioFilename = /\.(mp3|m4a|aac|ogg|wav|flac)$/i.test(filename)
        ? filename
        : `${filename}.mp3`;
      formData.set("audio", blob, audioFilename);

      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, {
        method: "POST",
        body: formData,
        // The 24/7 worker uploads over a home uplink (~100-150 KB/s), so a
        // 5-10 MB song legitimately needs over a minute to land.
        signal: AbortSignal.timeout(180000),
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
          mimeType: media.mime_type || mimeType,
        };
      }
    } catch (err: any) {
      console.warn(`[TelegramStorage] Buffer upload to ${channelId} failed:`, err.message);
    }
  }

  return null;
}
