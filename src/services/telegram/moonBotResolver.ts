/**
 * moonBotResolver.ts  —  Webhook-Powered Edition
 * ─────────────────────────────────────────────────
 * Uses @L_10_BOT in the Telegram channel as the PRIMARY audio source.
 *
 * Architecture:
 *  ┌─────────────────────────────────────────────────┐
 *  │  resolveViaMoonBot()                            │
 *  │    1. Send "يوتيوب" → bot posts menu in channel │
 *  │    2. Press "بحث اليوتوب صوت" via MTProto user │
 *  │       session (mtprotoPress) — no human needed  │
 *  │    3. Send "تنزيل {title} {artist}" message    │
 *  │    4. Poll Neon DB (moonbot_pending table)       │
 *  │       ↑ populated by /api/telegram/webhook      │
 *  │       ↑ which receives @L_10_BOT audio posts    │
 *  │    5. Return /api/telegram/stream URL            │
 *  └─────────────────────────────────────────────────┘
 *
 * Why DB polling instead of getUpdates?
 *   Telegram Bot API getUpdates does NOT return messages from
 *   other bots in the same channel. The webhook endpoint receives
 *   ALL channel posts including @L_10_BOT's audio files.
 */

import { saveTelegramCacheRecord, getTelegramDirectUrl } from "./telegramStorage";
import { query } from "@apis/neon";
import { JANNAT_OLD_CLASSICS } from "@/data/jannatClassics";
import { ANGHAM_OLD_CLASSICS } from "@/data/anghamClassics";

const BOT_TOKEN =
  process.env.TELEGRAM_BOT_TOKEN || "8831422517:AAEXQFzQxzcyIKWI1WtfVh2XGzguGXAnCak";
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || "-1004310944763";
const BASE = `https://api.telegram.org/bot${BOT_TOKEN}`;

export interface MoonBotResult {
  fileId: string;
  streamUrl: string;
  title: string;
  artist?: string;
  durationSec?: number;
  fileSize?: number;
  mimeType?: string;
}

/** Send a single message to the channel. Returns message_id. */
async function sendMsg(text: string): Promise<number | null> {
  try {
    const res = await fetch(`${BASE}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHANNEL_ID, text }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json();
    if (data.ok && data.result?.message_id) {
      console.log(`[WeciBot] Sent: "${text.slice(0, 40)}" → msg_id=${data.result.message_id}`);
      return data.result.message_id;
    }
    console.warn("[WeciBot] sendMessage failed:", data.description);
  } catch (err: any) {
    console.warn("[WeciBot] sendMessage error:", err.message);
  }
  return null;
}

/** Delete a message (channel cleanup). */
async function deleteMsg(messageId: number): Promise<void> {
  try {
    await fetch(`${BASE}/deleteMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHANNEL_ID, message_id: messageId }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {}
}

/**
 * Ensure moonbot_pending table exists in Neon DB.
 */
async function ensurePendingTable(): Promise<void> {
  try {
    await query(`
      CREATE TABLE IF NOT EXISTS moonbot_pending (
        id SERIAL PRIMARY KEY,
        tg_file_id TEXT UNIQUE NOT NULL,
        tg_message_id BIGINT,
        reply_to_message_id BIGINT,
        title TEXT,
        artist TEXT,
        duration_sec INT,
        file_size BIGINT,
        mime_type TEXT DEFAULT 'audio/mpeg',
        received_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  } catch {}
}

/**
 * Poll Neon DB for an audio entry that arrived AFTER our command message.
 * Validates that the audio is not a snippet (<45s) and not a Khaleeji mismatch.
 */
async function pollDbForAudio(
  afterMsgId: number,
  expectedTitle?: string,
  expectedArtist?: string,
  maxWaitMs = 28000
): Promise<any | null> {
  const start = Date.now();
  const pollIntervalMs = 800;

  while (Date.now() - start < maxWaitMs) {
    try {
      // Fetch up to 5 pending items after our command message
      const res = await query<any>(
        `SELECT tg_file_id, tg_message_id, reply_to_message_id, title, artist, duration_sec, file_size, mime_type
         FROM moonbot_pending
         WHERE tg_message_id > $1
         ORDER BY (reply_to_message_id = $1) DESC NULLS LAST, tg_message_id ASC
         LIMIT 5`,
        [afterMsgId]
      );

      for (const row of res.rows) {
        // 1. Check for bad duration (snippets < 45s)
        if (row.duration_sec && row.duration_sec > 0 && row.duration_sec < 45) {
          console.warn(`[WeciBot] Ignoring snippet (<45s): "${row.title}" (${row.duration_sec}s)`);
          continue;
        }

        // 2. Filter out known Khaleeji / mismatched singers
        const rowArtist = (row.artist || "").toLowerCase();
        const rowTitle = (row.title || "").toLowerCase();
        const isKhaleejiMismatch =
          rowArtist.includes("حماده") ||
          rowArtist.includes("مجرشي") ||
          rowArtist.includes("majra") ||
          rowTitle.includes("مجرشي") ||
          rowTitle.includes("حماده مجرشي") ||
          rowTitle.includes("شيلة") ||
          rowTitle.includes("شيلات") ||
          rowTitle.includes("جلسة عود") ||
          row.file_size === 8419726 ||
          row.file_size === 5634752;

        if (isKhaleejiMismatch) {
          console.warn(`[WeciBot] ❌ Rejected Khaleeji / bad audio: "${row.title}" by "${row.artist}"`);
          query(`DELETE FROM moonbot_pending WHERE tg_file_id = $1`, [row.tg_file_id]).catch(() => {});
          continue;
        }

        // 3. Artist check: if expectedArtist is Jannat or Angham, reject other artists
        if (expectedArtist && (expectedArtist.includes("جنات") || expectedArtist.toLowerCase().includes("jannat"))) {
          if (rowArtist && !rowArtist.includes("جنات") && !rowArtist.includes("jannat") && !rowArtist.includes("rotana") && !rowArtist.includes("aura") && !rowArtist.includes("music")) {
            console.warn(`[WeciBot] ❌ Rejected non-Jannat artist: "${row.artist}" for expected Jannat track "${expectedTitle}"`);
            continue;
          }
        }
        if (expectedArtist && (expectedArtist.includes("أنغام") || expectedArtist.toLowerCase().includes("angham"))) {
          if (rowArtist && !rowArtist.includes("أنغام") && !rowArtist.includes("angham") && !rowArtist.includes("rotana") && !rowArtist.includes("aura") && !rowArtist.includes("music")) {
            console.warn(`[WeciBot] ❌ Rejected non-Angham artist: "${row.artist}" for expected Angham track "${expectedTitle}"`);
            continue;
          }
        }

        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`[WeciBot] ✅ Audio validated hit in ${elapsed}s: "${row.title}" by "${row.artist}"`);
        return row;
      }
    } catch (err: any) {
      if (err.message?.includes("does not exist")) {
        await ensurePendingTable();
      } else {
        console.warn("[WeciBot] DB poll error:", err.message);
      }
    }

    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }

  return null;
}

/**
 * Register the Vercel webhook with Telegram (idempotent — safe to call multiple times).
 * Called once on first use to ensure the webhook is active.
 */
let webhookRegistered = false;
async function ensureWebhookRegistered(): Promise<void> {
  if (webhookRegistered) return;

  // Must be the PRODUCTION domain — VERCEL_URL points at per-deployment
  // preview hosts which are auth-protected (Telegram gets 401 and queues updates).
  const vercelUrl =
    process.env.NEXT_PUBLIC_APP_URL || "https://aura-musiic.vercel.app";

  const webhookUrl = `${vercelUrl}/api/telegram/webhook`;

  try {
    // Check current webhook
    const infoRes = await fetch(`${BASE}/getWebhookInfo`, { signal: AbortSignal.timeout(5000) });
    const info = await infoRes.json();
    const currentUrl = info.result?.url || "";

    if (currentUrl === webhookUrl) {
      webhookRegistered = true;
      return; // Already registered
    }

    // Set webhook
    const setRes = await fetch(`${BASE}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        allowed_updates: ["message", "channel_post", "edited_channel_post"],
        drop_pending_updates: false,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const setData = await setRes.json();
    if (setData.ok) {
      console.log(`[L10Bot] ✅ Webhook registered: ${webhookUrl}`);
      webhookRegistered = true;
    } else {
      console.warn("[L10Bot] Webhook registration failed:", setData.description);
    }
  } catch (err: any) {
    console.warn("[L10Bot] Webhook registration error:", err.message);
  }
}

/**
 * Main export: resolve a song via @L_10_BOT → Telegram CDN.
 *
 * Flow:
 *   1. Ensure webhook is registered (Vercel receives all channel posts)
 *   2. Send "يوتيوب" — bot posts its download menu in the channel
 *   3. Wait (≤20s) for a human to press "بحث اليوتوب صوت" (webhook
 *      marks the window in moonbot_mode when the menu is edited)
 *   4. Send "تنزيل {title} {artist}" — answered only inside that window
 *   5. Poll Neon DB until webhook delivers the audio (max 90s)
 *   6. Save to main cache → return stream URL
 */
async function processPendingAudio(
  pending: any,
  videoId: string | undefined,
  title: string,
  artist: string
): Promise<MoonBotResult | null> {
  const fileId: string = pending.tg_file_id;
  const mimeType: string = pending.mime_type || "audio/mpeg";
  const durationSec: number | undefined = pending.duration_sec;
  const fileSize: number | undefined = pending.file_size;
  const resolvedTitle: string = pending.title || title;
  const resolvedArtist: string = pending.artist || artist || "Aura Music";

  // Get direct Telegram CDN URL
  const directUrl = await getTelegramDirectUrl(fileId);
  if (!directUrl) {
    console.warn("[L10Bot] Could not resolve CDN URL for file_id:", fileId);
    return null;
  }

  // Save to main cache (for future instant lookups)
  await saveTelegramCacheRecord({
    videoId,
    title: resolvedTitle,
    artist: resolvedArtist,
    tgFileId: fileId,
    tgMessageId: pending.tg_message_id,
    durationSec,
    fileSize,
    mimeType,
  });

  // Clean up pending record
  query(`DELETE FROM moonbot_pending WHERE tg_file_id = $1`, [fileId]).catch(() => {});

  const streamUrl = `/api/telegram/stream?fileId=${encodeURIComponent(fileId)}&title=${encodeURIComponent(resolvedTitle)}`;

  console.log(`[L10Bot] 🎵 Ready: "${resolvedTitle}" by "${resolvedArtist}" → ${streamUrl}`);

  return {
    fileId,
    streamUrl,
    title: resolvedTitle,
    artist: resolvedArtist,
    durationSec,
    fileSize,
    mimeType,
  };
}

export function cleanQueryForWeciBot(rawTitle: string, rawArtist?: string): string {
  let title = (rawTitle || "").trim();
  let artist = (rawArtist || "").trim();

  // If title matches Jannat or Angham classics, enforce the canonical title and artist
  const jannat = JANNAT_OLD_CLASSICS.find(c =>
    c.title.trim().toLowerCase() === title.toLowerCase() ||
    title.toLowerCase().includes(c.title.trim().toLowerCase())
  );
  if (jannat) {
    title = jannat.title;
    artist = "جنات";
  } else {
    const angham = ANGHAM_OLD_CLASSICS.find(c =>
      c.title.trim().toLowerCase() === title.toLowerCase() ||
      title.toLowerCase().includes(c.title.trim().toLowerCase())
    );
    if (angham) {
      title = angham.title;
      artist = "أنغام";
    }
  }

  // Strip video suffixes and tags
  title = title
    .replace(/\(Official.*?\)/gi, "")
    .replace(/\[Official.*?\]/gi, "")
    .replace(/\(Audio.*?\)/gi, "")
    .replace(/\[Audio.*?\]/gi, "")
    .replace(/\(Lyric.*?\)/gi, "")
    .replace(/\[Lyric.*?\]/gi, "")
    .replace(/\(Video.*?\)/gi, "")
    .replace(/\[Video.*?\]/gi, "")
    .replace(/\|.*$/g, "")
    .replace(/فيديو كليب/g, "")
    .replace(/كليب رسمي/g, "")
    .replace(/الأغنية الرسمية/g, "")
    .trim();

  // If there's a slash / separating Arabic and English (e.g. "اللي بيني وبينك / Elly Bene"), pick Arabic
  if (title.includes("/")) {
    const halves = title.split("/");
    const arabicHalf = halves.find((h) => /[\u0600-\u06FF]/.test(h));
    if (arabicHalf && arabicHalf.trim().length >= 2) {
      title = arabicHalf.trim();
    } else {
      title = halves[0].trim();
    }
  }

  // If title has "Artist - Title" format (e.g. "جنات - حب امتلاك")
  if (title.includes("-")) {
    const parts = title.split("-");
    if (parts.length === 2) {
      const p0 = parts[0].trim();
      const p1 = parts[1].trim();
      if (artist && (p0.toLowerCase() === artist.toLowerCase() || p0 === artist)) {
        title = p1;
      } else if (artist && (p1.toLowerCase() === artist.toLowerCase() || p1 === artist)) {
        title = p0;
      } else if (/[\u0600-\u06FF]/.test(p1) && p0.length < 25) {
        artist = p0;
        title = p1;
      }
    }
  }

  // Clean generic artist
  if (
    !artist ||
    artist === "فنان" ||
    artist === "فنان غير معروف" ||
    artist === "غير معروف" ||
    artist.toLowerCase().includes("unknown") ||
    artist === "Aura Music"
  ) {
    artist = "";
  } else {
    artist = artist
      .replace(/\s*-\s*topic\b/gi, "")
      .replace(/\s*vevo\b/gi, "")
      .replace(/\s*official\b/gi, "")
      .replace(/\s*channel\b/gi, "")
      .replace(/\s*records\b/gi, "")
      .replace(/\s*music\b/gi, "")
      .trim();
  }

  const queryParts = [title];
  if (artist && !title.toLowerCase().includes(artist.toLowerCase())) {
    queryParts.push(artist);
  }

  return queryParts.join(" ").replace(/\s+/g, " ").trim();
}

export async function resolveViaMoonBot(params: {
  title: string;
  artist?: string;
  videoId?: string;
}): Promise<MoonBotResult | null> {
  let { title, artist = "", videoId } = params;

  // Resolve classic artist if missing
  const jannat = JANNAT_OLD_CLASSICS.find(c =>
    (videoId && (c.songId === videoId || c.youtubeVideoId === videoId)) ||
    c.title.trim().toLowerCase() === title.trim().toLowerCase()
  );
  if (jannat) {
    title = jannat.title;
    artist = "جنات";
    if (!videoId) videoId = jannat.youtubeVideoId;
  }

  const angham = ANGHAM_OLD_CLASSICS.find(c =>
    (videoId && (c.songId === videoId || c.youtubeVideoId === videoId)) ||
    c.title.trim().toLowerCase() === title.trim().toLowerCase()
  );
  if (angham) {
    title = angham.title;
    artist = "أنغام";
    if (!videoId) videoId = angham.youtubeVideoId;
  }

  if (!BOT_TOKEN || !CHANNEL_ID) {
    console.warn("[WeciBot] Missing BOT_TOKEN or CHANNEL_ID");
    return null;
  }

  // Register webhook if needed (fast no-op after first call)
  await ensureWebhookRegistered();

  // Ensure DB tables exist
  await ensurePendingTable();

  const cleanSongQuery = cleanQueryForWeciBot(title, artist);

  // Exact command requested by user: "نزل {title} {artist}"
  const weciCommand = `نزل ${cleanSongQuery}`;
  console.log(`[WeciBot] 🤖 Executing command in channel: "${weciCommand}" for "${title}" by "${artist}"...`);
  const weciMsgId = await sendMsg(weciCommand);
  if (weciMsgId) {
    console.log(`[WeciBot] Sent "${weciCommand}" (msgId=${weciMsgId}) — waiting for audio webhook...`);
    const pending = await pollDbForAudio(weciMsgId, title, artist, 28000);

    // Clean up command message asynchronously
    deleteMsg(weciMsgId).catch(() => {});

    if (pending) {
      console.log(`[WeciBot] ✅ Audio received successfully from bot for "${title}"!`);
      return await processPendingAudio(pending, videoId, title, artist);
    }
    console.warn(`[WeciBot] No valid audio from bot within 28s for "${weciCommand}"`);
  }

  return null;
}

