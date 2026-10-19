import { NextRequest, NextResponse } from "next/server";
import { saveTelegramCacheRecord } from "@/services/telegram/telegramStorage";

export const dynamic = "force-dynamic";

/**
 * Telegram Webhook Handler
 * ────────────────────────
 * Allows anyone/admin to drop MP3 files directly into the Telegram channel or forward to the bot.
 * The webhook instantly parses the ID3 tags, records the file_id, and indexes the track in Neon DB.
 */
export async function POST(req: NextRequest) {
  try {
    const update = await req.json();

    const message = update.message || update.channel_post || update.edited_channel_post;
    if (!message) {
      return NextResponse.json({ ok: true, ignored: "no message payload" });
    }

    const audio = message.audio;
    const doc = message.document;

    // Check if the message contains audio or an audio document
    if (audio || (doc && doc.mime_type && doc.mime_type.startsWith("audio/"))) {
      const media = audio || doc;
      const fileId = media.file_id;
      const rawTitle = audio?.title || doc?.file_name?.replace(/\.[^/.]+$/, "") || message.caption || "Aura Track";
      const artist = audio?.performer || "Aura Music";
      const durationSec = audio?.duration || 0;
      const fileSize = media.file_size || 0;
      const mimeType = media.mime_type || "audio/mpeg";

      console.log(`[TelegramWebhook] Auto-indexing dropped track: "${rawTitle}" by "${artist}" (file_id=${fileId})`);

      await saveTelegramCacheRecord({
        title: rawTitle,
        artist,
        tgFileId: fileId,
        tgMessageId: message.message_id,
        durationSec,
        fileSize,
        mimeType,
      });

      return NextResponse.json({
        ok: true,
        indexed: {
          title: rawTitle,
          artist,
          fileId,
        },
      });
    }

    return NextResponse.json({ ok: true, status: "non-audio update ignored" });
  } catch (err: any) {
    console.error("[TelegramWebhook] Error processing update:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    status: "active",
    service: "Aura Music Telegram Ingestion Webhook",
    timestamp: new Date().toISOString(),
  });
}
