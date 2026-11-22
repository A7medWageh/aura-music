import { NextRequest, NextResponse } from "next/server";
import { query } from "@apis/neon";
import {
  extractSmartArtistAndTitle,
  cleanSongTitle,
  cleanText,
  findBestOfficialVideo,
} from "@/services/music/artistMatcher";

export const dynamic = "force-dynamic";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "8831422517:AAEXQFzQxzcyIKWI1WtfVh2XGzguGXAnCak";
const CHANNEL_ID = process.env.TELEGRAM_CHANNEL_ID || "-1004310944763";

function tokensOf(value: string): string[] {
  return cleanText(value).split(" ").filter((w) => w.length > 1);
}

function overlappingTokens(a: string[], b: string[]): number {
  return a.filter((token) => b.some((other) => other === token || other.includes(token) || token.includes(other))).length;
}

async function resolveTrackArtwork(title: string, artist: string): Promise<string> {
  const cleanQ = `${artist} ${title}`.replace(/[\(\)\[\]\|]/g, " ").trim();
  const titleTokens = tokensOf(title);
  const artistTokens = tokensOf(artist);

  // 1. iTunes Search API — pick the result that actually matches this artist + track
  try {
    const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQ)}&media=music&entity=song&limit=8`;
    const res = await fetch(itunesUrl, {
      signal: AbortSignal.timeout(3500),
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = await res.json();
      for (const item of data.results || []) {
        const trackTokens = tokensOf(item.trackName || "");
        const itemArtistTokens = tokensOf(item.artistName || "");
        const artistScore = overlappingTokens(artistTokens, itemArtistTokens);
        const titleScore = overlappingTokens(titleTokens, trackTokens);
        if (artistScore >= 1 && titleScore >= 1 && item.artworkUrl100) {
          return String(item.artworkUrl100).replace("100x100bb", "1000x1000bb");
        }
      }
    }
  } catch {}

  // 2. Official music video thumbnail — matches the same clip the player prioritises
  try {
    const { searchYouTube } = await import("@apis/youtubei.js");
    const searchRes: any = await searchYouTube(cleanQ);
    const songs = searchRes?.videos || searchRes?.songs || [];
    const candidates = songs.map((s: any) => ({
      youtubeVideoId: s.youtubeVideoId || s.songId || s.id,
      title: s.title || "",
      artist: s.artist || s.author?.name || "",
      channel: s.author?.name || s.channel || "",
      durationSec: s.duration?.seconds || s.durationSec,
    }));
    const bestVid = findBestOfficialVideo(candidates, title, artist);
    if (bestVid) {
      return `https://i.ytimg.com/vi/${bestVid}/maxresdefault.jpg`;
    }
  } catch {}

  // 3. Plain YouTube search fallback for the artwork only
  try {
    const yts = require("yt-search");
    const r = await yts(cleanQ);
    const first = r?.videos?.find((v: any) => {
      const hay = cleanText(`${v.title || ""} ${v.author?.name || ""}`);
      return titleTokens.some((t) => hay.includes(t)) && artistTokens.some((a) => hay.includes(a));
    });
    if (first?.thumbnail) {
      return String(first.thumbnail).replace(/\/(?:hq)?default\.jpg/, "/maxresdefault.jpg");
    }
  } catch {}

  return "https://aura-musiic.vercel.app/aura-gold-icon.png";
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawInput = (body.input || body.url || body.query || "").toString().trim();

    if (!rawInput) {
      return NextResponse.json({ error: "الرجاء إدخال رابط الرسالة أو اسم الأغنية" }, { status: 400 });
    }

    // 1. Check if input is a Telegram link or message ID
    let targetMsgId: number | null = null;
    let targetChannel: string | null = null;

    // Pattern: https://t.me/c/4310944763/123 or https://t.me/channel/123
    const linkMatch = rawInput.match(/t\.me\/(?:c\/)?([^\/\s]+)\/(\d+)/i);
    if (linkMatch) {
      targetChannel = linkMatch[1];
      targetMsgId = parseInt(linkMatch[2], 10);
    } else if (/^\d+$/.test(rawInput)) {
      targetMsgId = parseInt(rawInput, 10);
    }

    // 2. Query Neon Database for already-cached record
    let foundTrack: any = null;

    if (targetMsgId) {
      const cacheRes = await query<any>(
        `SELECT * FROM telegram_audio_cache WHERE tg_message_id = $1 LIMIT 1`,
        [targetMsgId]
      );
      if (cacheRes.rows.length > 0) {
        foundTrack = cacheRes.rows[0];
      } else {
        const pendingRes = await query<any>(
          `SELECT * FROM moonbot_pending WHERE tg_message_id = $1 LIMIT 1`,
          [targetMsgId]
        );
        if (pendingRes.rows.length > 0) {
          foundTrack = pendingRes.rows[0];
        }
      }
    }

    // 3. If not found by msgId or input is a text query / title
    if (!foundTrack) {
      const cleanSearch = rawInput.replace(/[%_\\]/g, "");
      const searchPattern = `%${cleanSearch}%`;
      const searchRes = await query<any>(
        `SELECT * FROM telegram_audio_cache 
         WHERE title ILIKE $1 OR artist ILIKE $1 
         ORDER BY id DESC LIMIT 5`,
        [searchPattern]
      );
      if (searchRes.rows.length > 0) {
        foundTrack = searchRes.rows[0];
      } else {
        const pendingSearch = await query<any>(
          `SELECT * FROM moonbot_pending 
           WHERE title ILIKE $1 OR artist ILIKE $1 
           ORDER BY id DESC LIMIT 5`,
          [searchPattern]
        );
        if (pendingSearch.rows.length > 0) {
          foundTrack = pendingSearch.rows[0];
        }
      }
    }

    // 4. If still not found and targetMsgId is provided, try MTProto lookup
    if (!foundTrack && targetMsgId) {
      try {
        const res = await query<any>(
          "SELECT value FROM system_config WHERE key = 'tg_user_session' LIMIT 1"
        );
        if (res.rows.length > 0) {
          const cfg = JSON.parse(res.rows[0].value);
          const { TelegramClient } = await import("telegram");
          const { MemorySession } = await import("telegram/sessions");
          const { AuthKey } = await import("telegram/crypto/AuthKey");

          const session = new MemorySession();
          session.setDC(cfg.dcId, cfg.server, cfg.port);
          const authKey = new AuthKey();
          await authKey.setKey(Buffer.from(cfg.authKeyHex, "hex"));
          session.setAuthKey(authKey, cfg.dcId);

          const client = new TelegramClient(session, cfg.apiId, cfg.apiHash, {
            connectionRetries: 1,
            autoReconnect: false,
          });

          await client.connect();
          const channelToUse = targetChannel && targetChannel.startsWith("-100")
            ? targetChannel
            : (targetChannel && /^\d+$/.test(targetChannel) ? `-100${targetChannel}` : CHANNEL_ID);

          const messages = await client.getMessages(channelToUse, { ids: [targetMsgId] });
          if (messages && messages.length > 0) {
            const m = messages[0] as any;
            const doc = m.media?.document;
            if (doc) {
              const mime = doc.mimeType || "audio/mpeg";
              let title = "أغنية تيليجرام";
              let artist = "Aura Music";
              let durationSec = 0;

              for (const attr of doc.attributes || []) {
                if (attr.className === "DocumentAttributeAudio") {
                  if (attr.title) title = attr.title;
                  if (attr.performer) artist = attr.performer;
                  if (attr.duration) durationSec = attr.duration;
                }
                if (attr.className === "DocumentAttributeFilename" && !title) {
                  title = attr.fileName?.replace(/\.[^/.]+$/, "");
                }
              }

              const extracted = extractSmartArtistAndTitle(title, artist);
              if (extracted.title) title = extracted.title;
              if (extracted.artist) artist = extracted.artist;
              title = cleanSongTitle(title, artist);

              foundTrack = {
                tg_file_id: String(doc.id),
                tg_message_id: targetMsgId,
                title,
                artist,
                duration_sec: durationSec,
                file_size: Number(doc.size || 0),
                mime_type: mime,
              };
            }
          }
          await client.disconnect();
        }
      } catch (mtprotoErr: any) {
        console.warn("[ManualImport] MTProto lookup warning:", mtprotoErr?.message);
      }
    }

    if (!foundTrack) {
      return NextResponse.json(
        {
          error: "لم يتم العثور على الأغنية. تأكد من نشر الملف الصوتي في القناة أولاً ونسخ الرابط الصحيح (مثال: https://t.me/c/.../123).",
          status: "not_found",
        },
        { status: 404 }
      );
    }

    const fileId = foundTrack.tg_file_id || foundTrack.file_id || String(foundTrack.id);
    const rawTitle = foundTrack.title || "أغنية تيليجرام";
    const rawArtist = foundTrack.artist || "فنان غير معروف";
    const duration = Number(foundTrack.duration_sec || foundTrack.duration || 0);

    const smartExtracted = extractSmartArtistAndTitle(rawTitle, rawArtist);
    const resolvedArtist = smartExtracted.artist || rawArtist;
    const resolvedTitle = cleanSongTitle(smartExtracted.title || rawTitle, resolvedArtist);

    // Resolve high-resolution official cover artwork
    const resolvedThumbnail = await resolveTrackArtwork(resolvedTitle, resolvedArtist);

    const song = {
      id: `tg_${fileId}`,
      title: resolvedTitle,
      artist: resolvedArtist,
      duration,
      youtubeVideoId: `tg_${fileId}`,
      thumbnailUrl: resolvedThumbnail,
      streamUrl: `https://aura-musiic.vercel.app/api/telegram/stream?fileId=${encodeURIComponent(fileId)}`,
      fileSize: Number(foundTrack.file_size || foundTrack.fileSize || 0),
      albumName: undefined, // Never assign "مكتبة تيليجرام", songs belong to their artist folder!
      source: "telegram",
    };

    return NextResponse.json({ success: true, song });
  } catch (err: any) {
    console.error("[ManualImport] Error:", err);
    return NextResponse.json({ error: err?.message || "Internal server error" }, { status: 500 });
  }
}

