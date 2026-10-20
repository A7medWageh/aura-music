/**
 * moonBotResolver.ts  —  Webhook-Powered Edition
 * ─────────────────────────────────────────────────
 * Uses @L_10_BOT in the Telegram channel as the PRIMARY audio source.
 *
 * Architecture:
 *  ┌─────────────────────────────────────────────────┐
 *  │  resolveViaMoonBot()                            │
 *  │    1. Send "تنزيل {title} {artist}" message    │
 *  │    2. Poll Neon DB (moonbot_pending table)       │
 *  │       ↑ populated by /api/telegram/webhook      │
 *  │       ↑ which receives @L_10_BOT audio posts    │
 *  │    3. Return /api/telegram/stream URL            │
 *  └─────────────────────────────────────────────────┘
 *
 * Why DB polling instead of getUpdates?
 *   Telegram Bot API getUpdates does NOT return messages from
 *   other bots in the same channel. The webhook endpoint receives
 *   ALL channel posts including @L_10_BOT's audio files.
 */

import { saveTelegramCacheRecord, getTelegramDirectUrl } from "./telegramStorage";
import { query } from "@apis/neon";

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
      console.log(`[L10Bot] Sent: "${text.slice(0, 40)}" → msg_id=${data.result.message_id}`);
      return data.result.message_id;
    }
    console.warn("[L10Bot] sendMessage failed:", data.description);
  } catch (err: any) {
    console.warn("[L10Bot] sendMessage error:", err.message);
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
 * The webhook handler inserts rows into moonbot_pending when @L_10_BOT
 * posts audio in the channel.
 */
async function pollDbForAudio(
  afterMsgId: number,
  maxWaitMs = 60000
): Promise<any | null> {
  const start = Date.now();
  const pollIntervalMs = 800;

  while (Date.now() - start < maxWaitMs) {
    try {
      // Prefer an audio that is a direct reply to our search message,
      // otherwise take the first audio posted after it.
      const res = await query<any>(
        `SELECT tg_file_id, tg_message_id, title, artist, duration_sec, file_size, mime_type
         FROM moonbot_pending
         WHERE tg_message_id > $1
         ORDER BY (reply_to_message_id = $1) DESC NULLS LAST, tg_message_id ASC
         LIMIT 1`,
        [afterMsgId]
      );

      if (res.rows.length > 0) {
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        console.log(`[L10Bot] ✅ DB hit in ${elapsed}s: "${res.rows[0].title}"`);
        return res.rows[0];
      }
    } catch (err: any) {
      // If table doesn't exist yet, create it
      if (err.message?.includes("does not exist")) {
        await ensurePendingTable();
      } else {
        console.warn("[L10Bot] DB poll error:", err.message);
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
 *   2. Send "تنزيل {title} {artist}" to the channel
 *   3. Poll Neon DB until webhook delivers @L_10_BOT's audio (max 90s)
 *   4. Save to main cache → return stream URL
 */
export async function resolveViaMoonBot(params: {
  title: string;
  artist?: string;
  videoId?: string;
}): Promise<MoonBotResult | null> {
  const { title, artist = "", videoId } = params;

  if (!BOT_TOKEN || !CHANNEL_ID) {
    console.warn("[L10Bot] Missing BOT_TOKEN or CHANNEL_ID");
    return null;
  }

  // Register webhook if needed (fast no-op after first call)
  await ensureWebhookRegistered();

  // Ensure DB table exists
  await ensurePendingTable();

  // Single-message flow (no buttons): send "تنزيل {title} {artist}"
  // and wait for @L_10_BOT's audio reply via the webhook.
  const queryText = `تنزيل ${title}${artist ? ` ${artist}` : ""}`;
  const searchMsgId = await sendMsg(queryText);
  if (!searchMsgId) return null;

  console.log(`[L10Bot] Waiting for webhook to deliver audio for "${title}"...`);

  // Step 3: Poll DB for audio (populated by /api/telegram/webhook)
  const pending = await pollDbForAudio(searchMsgId, 90000);

  // Cleanup our message
  deleteMsg(searchMsgId).catch(() => {});

  if (!pending) {
    console.warn(`[L10Bot] No audio received for "${title}" within 90s`);
    return null;
  }

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
