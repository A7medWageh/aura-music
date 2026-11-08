import { NextRequest, NextResponse } from "next/server";
import { saveTelegramCacheRecord } from "@/services/telegram/telegramStorage";
import { extractSmartArtistAndTitle } from "@/services/music/artistMatcher";
import { query } from "@apis/neon";

export const dynamic = "force-dynamic";

/**
 * Accurately parse metadata from @L_10_BOT and @wecibot captions / audio objects
 */
function parseBotMetadata(audio: any, doc: any, caption: string | undefined): {
  title: string;
  artist: string;
  durationSec: number;
} {
  const cap = caption || "";
  let title = audio?.title || doc?.file_name?.replace(/\.[^/.]+$/, "") || "";
  let artist = audio?.performer || "";
  let durationSec = audio?.duration || 0;

  // 1. @L_10_BOT format (found in caption or title: Title ➖ ... Duration ➖ ...)
  const l10Source = cap.includes("Title ➖") ? cap : (title.includes("Title ➖") ? title : "");
  if (l10Source) {
    const l10Title = l10Source.match(/Title\s*➖\s*([^\n]+)/i)?.[1]?.trim();
    if (l10Title) title = l10Title;
    const l10Dur = l10Source.match(/Duration\s*➖\s*(\d+)/i)?.[1];
    if (l10Dur && !durationSec) durationSec = Number(l10Dur);
    const l10Artist = l10Source.match(/Channel\s*➖\s*([^\n]+)/i)?.[1]?.trim();
    if (l10Artist && (!artist || artist === "Aura Music")) artist = l10Artist;
  }

  // 2. @wecibot format (- music by : @wecibot, - info : {Title}, - duration : mm:ss)
  if (cap.includes("@wecibot") || cap.includes("- info :")) {
    const weciInfo = cap.match(/-\s*info\s*:\s*([^\n]+)/i)?.[1]?.trim();
    if (weciInfo) {
      title = weciInfo;
    }
  }

  // 3. User manual upload with caption (e.g. "ابراهيم الحكمي - يا زين يا ولد الزين")
  if (cap && !cap.includes("@wecibot") && !cap.includes("Title ➖")) {
    const cleanCap = cap.replace(/https?:\/\/[^\s]+/g, "").trim();
    if (cleanCap) {
      const fromCap = extractSmartArtistAndTitle(cleanCap, artist);
      if (fromCap.title && fromCap.title !== "أغنية محفوظة") {
        title = fromCap.title;
        if (fromCap.artist) artist = fromCap.artist;
      }
    }
  }

  // 4. Clean file extension if title ends in .mp3, .m4a, etc.
  title = title.replace(/\.(mp3|m4a|ogg|flac|wav|aac)$/i, "").trim();

  // Smart extraction: extract true singer and clean title if performer is a record label or YouTube channel
  const extracted = extractSmartArtistAndTitle(title, artist);
  if (extracted.title) title = extracted.title;
  if (extracted.artist) artist = extracted.artist;

  if (!title) title = cap || "Aura Track";
  if (!artist) artist = "Aura Music";

  return { title, artist, durationSec };
}

/**
 * Telegram Webhook Handler
 * ────────────────────────
 * Receives ALL channel posts from Telegram (registered via setWebhook).
 *
 * Handles two cases:
 * 1. Audio/document from @wecibot or @L_10_BOT → saves to moonbot_pending + telegram_audio_cache
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
      const parsed = parseBotMetadata(audio, doc, message.caption);
      const title: string = parsed.title;
      const artist: string = parsed.artist;
      const durationSec: number = parsed.durationSec;
      const fileSize: number = media.file_size || 0;
      const mimeType: string = media.mime_type || "audio/mpeg";
      const msgId: number = message.message_id;
      const replyToMsgId: number | null =
        message.reply_to_message?.message_id ?? null;

      console.log(
        `[TelegramWebhook] Audio received: "${title}" by "${artist}" (file_id=${fileId}, replyTo=${replyToMsgId})`
      );

      // Validate: Reject snippets and Khaleeji mismatch
      const rowArtist = (artist || "").toLowerCase();
      const rowTitle = (title || "").toLowerCase();
      const isBadDuration = durationSec > 0 && durationSec < 45;
      const isKhaleejiMismatch =
        rowArtist.includes("حماده") ||
        rowArtist.includes("مجرشي") ||
        rowArtist.includes("majra") ||
        rowTitle.includes("مجرشي") ||
        rowTitle.includes("حماده مجرشي") ||
        rowTitle.includes("شيلة") ||
        rowTitle.includes("شيلات") ||
        rowTitle.includes("جلسة عود") ||
        fileSize === 8419726 ||
        fileSize === 5634752;

      if (isBadDuration || isKhaleejiMismatch) {
        console.warn(`[TelegramWebhook] ⚠️ Blocked bad audio from caching: "${title}" by "${artist}" (size=${fileSize}, dur=${durationSec})`);
        return NextResponse.json({ ok: true, status: "ignored_bad_audio" });
      }

      // 1. Save to moonbot_pending for resolveViaMoonBot polling
      try {
        await query(
          `INSERT INTO moonbot_pending (tg_file_id, tg_message_id, reply_to_message_id, title, artist, duration_sec, file_size, mime_type, received_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
           ON CONFLICT (tg_file_id) DO UPDATE SET
             title = EXCLUDED.title,
             artist = EXCLUDED.artist,
             tg_message_id = EXCLUDED.tg_message_id,
             reply_to_message_id = COALESCE(EXCLUDED.reply_to_message_id, moonbot_pending.reply_to_message_id)`,
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
             ON CONFLICT (tg_file_id) DO UPDATE SET
               title = EXCLUDED.title,
               artist = EXCLUDED.artist,
               tg_message_id = EXCLUDED.tg_message_id,
               reply_to_message_id = COALESCE(EXCLUDED.reply_to_message_id, moonbot_pending.reply_to_message_id)`,
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
