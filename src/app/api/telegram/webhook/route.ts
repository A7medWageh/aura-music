import { NextRequest, NextResponse } from "next/server";
import { saveTelegramCacheRecord } from "@/services/telegram/telegramStorage";
import { query } from "@apis/neon";

export const dynamic = "force-dynamic";

/**
 * @L_10_BOT names its audio files like:
 *   🎶 Title  Song - Artist (Official Video)\n⏱ Duration ➖ 258\n🎤 Channel  ...
 * Extract the clean title/duration instead of storing the raw blob.
 */
function parseBotFileName(raw: string): { title: string; durationSec: number | null } {
  const title = raw.match(/Title\s*➖\s*([^\n]+)/i)?.[1]?.trim();
  if (!title) return { title: raw, durationSec: null };
  const dur = raw.match(/Duration\s*➖\s*(\d+)/i)?.[1];
  return { title, durationSec: dur ? Number(dur) : null };
}

/**
 * Telegram Webhook Handler
 * ────────────────────────
 * Receives ALL channel posts from Telegram (registered via setWebhook).
 *
 * Handles two cases:
 * 1. Audio/document from @L_10_BOT (or any bot) → saves to moonbot_pending + telegram_audio_cache
 * 2. Direct MP3 drops by admins → indexes in telegram_audio_cache
 */
export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    const message =
      update.message ||
      update.channel_post ||
      update.edited_channel_post;

    if (!message) {
      return NextResponse.json({ ok: true, ignored: "no message payload" });
    }

    const audio = message.audio;
    const doc = message.document;

    const isAudioDoc =
      doc?.mime_type?.startsWith("audio/") ||
      doc?.file_name?.match(/\.(mp3|m4a|ogg|flac)$/i);
    const media = audio || (isAudioDoc ? doc : null);

    if (media?.file_id) {
      const fileId: string = media.file_id;
      const rawTitle: string =
        audio?.title ||
        doc?.file_name?.replace(/\.[^/.]+$/, "") ||
        message.caption ||
        "Aura Track";
      const parsed = parseBotFileName(rawTitle);
      const title: string = parsed.title;
      const artist: string =
        audio?.performer ||
        rawTitle.match(/Channel\s*➖\s*([^\n]+)/i)?.[1]?.trim() ||
        "Aura Music";
      const durationSec: number = audio?.duration || parsed.durationSec || 0;
      const fileSize: number = media.file_size || 0;
      const mimeType: string = media.mime_type || "audio/mpeg";
      const msgId: number = message.message_id;
      const replyToMsgId: number | null =
        message.reply_to_message?.message_id ?? null;

      console.log(
        `[TelegramWebhook] Audio received: "${title}" by "${artist}" (file_id=${fileId}, replyTo=${replyToMsgId})`
      );

      // 1. Save to moonbot_pending for resolveViaMoonBot polling
      try {
        await query(
          `INSERT INTO moonbot_pending (tg_file_id, tg_message_id, reply_to_message_id, title, artist, duration_sec, file_size, mime_type, received_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT (tg_file_id) DO NOTHING`,
          [fileId, msgId, replyToMsgId, title, artist, durationSec, fileSize, mimeType]
        );
      } catch (dbErr: any) {
        // Table might not exist yet — try to create it
        if (dbErr.message?.includes("does not exist")) {
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
          await query(
            `INSERT INTO moonbot_pending (tg_file_id, tg_message_id, reply_to_message_id, title, artist, duration_sec, file_size, mime_type)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (tg_file_id) DO NOTHING`,
            [fileId, msgId, replyToMsgId, title, artist, durationSec, fileSize, mimeType]
          );
        } else {
          console.warn("[TelegramWebhook] moonbot_pending insert error:", dbErr.message);
        }
      }

      // Bot exits search mode after each download — close the window.
      query("UPDATE moonbot_mode SET active_until = NOW() WHERE id = 1").catch(() => {});

      // 2. Also index in main cache
      await saveTelegramCacheRecord({
        title,
        artist,
        tgFileId: fileId,
        tgMessageId: msgId,
        durationSec,
        fileSize,
        mimeType,
      });

      return NextResponse.json({
        ok: true,
        indexed: { title, artist, fileId, replyToMsgId },
      });
    }

    return NextResponse.json({ ok: true, status: "non-audio update ignored" });
  } catch (err: any) {
    console.error("[TelegramWebhook] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "Aura Music Telegram Webhook",
    timestamp: new Date().toISOString(),
  });
}
