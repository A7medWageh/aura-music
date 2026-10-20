import { NextRequest, NextResponse } from "next/server";
import { resolveUniversalAudio, type UniversalAudioResult } from "@/services/music/universalAudioResolver";
import { streamAudioFromYouTube, isYtDlpAvailable } from "@apis/yt-dlp";
import { findBestOfficialVideo } from "@/services/music/artistMatcher";
import { uploadAudioBufferToTelegram } from "@/services/telegram/telegramStorage";

export const dynamic = "force-dynamic";

let lastKnownWorkerUrl = process.env.REMOTE_STREAM_WORKER || "";
let lastWorkerCheck = 0;

async function checkWorkerHealth(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(3500),
      headers: { "User-Agent": "AuraMusic/1.0" },
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function getRemoteWorkerUrl(): Promise<string | null> {
  if (lastKnownWorkerUrl && Date.now() - lastWorkerCheck < 60000) {
    return lastKnownWorkerUrl;
  }

  // A configured worker can be asleep on free hosting; let the audio request wake it.
  if (process.env.REMOTE_STREAM_WORKER) {
    try {
      const configuredUrl = new URL(process.env.REMOTE_STREAM_WORKER);
      if (configuredUrl.protocol === "https:" || configuredUrl.protocol === "http:") {
        lastKnownWorkerUrl = configuredUrl.toString().replace(/\/$/, "");
        lastWorkerCheck = Date.now();
        return lastKnownWorkerUrl;
      }
    } catch {
      console.error("[ytdownload] REMOTE_STREAM_WORKER must be a valid HTTP(S) URL");
    }
  }

  // Check Neon Database system_config table (where auto-start.js records active tunnel)
  try {
    const { query } = await import("@apis/neon");
    const dbRes = await query<{ value: string }>(
      "SELECT value FROM system_config WHERE key = 'tunnel_url' LIMIT 1"
    );
    const dbUrl = dbRes.rows[0]?.value?.trim();
    if (dbUrl && (dbUrl.startsWith("https://") || dbUrl.startsWith("http://"))) {
      const isOk = await checkWorkerHealth(dbUrl);
      if (isOk) {
        lastKnownWorkerUrl = dbUrl;
        lastWorkerCheck = Date.now();
        console.log(`[ytdownload] Active remote worker verified from DB: ${lastKnownWorkerUrl}`);
        return lastKnownWorkerUrl;
      }
    }
  } catch (err: any) {
    console.warn("[ytdownload] DB tunnel check failed:", err.message);
  }

  // 3. Fallback to ntfy.sh topic (supports both trycloudflare and ngrok)
  try {
    const res = await fetch("https://ntfy.sh/aura_music_link_8472/json?poll=1", {
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const text = await res.text();
      const lines = text.trim().split("\n").filter(Boolean);
      for (let i = lines.length - 1; i >= 0; i--) {
        try {
          const item = JSON.parse(lines[i]);
          const urlMatch = (item.message || "").match(
            /https:\/\/[a-zA-Z0-9\-]+(?:\.trycloudflare\.com|\.ngrok[^\s]+)/
          );
          if (urlMatch) {
            const candUrl = urlMatch[0].trim();
            const isOk = await checkWorkerHealth(candUrl);
            if (isOk) {
              lastKnownWorkerUrl = candUrl;
              lastWorkerCheck = Date.now();
              console.log(`[ytdownload] Active remote worker verified from ntfy: ${lastKnownWorkerUrl}`);
              return lastKnownWorkerUrl;
            }
          }
        } catch {}
      }
    }
  } catch {}

  lastKnownWorkerUrl = "";
  lastWorkerCheck = Date.now();
  return null;
}

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store",
};

const MAX_TELEGRAM_AUDIO_BYTES = 50 * 1024 * 1024;

async function readAudioBuffer(body: ReadableStream<Uint8Array> | null): Promise<Buffer> {
  if (!body) throw new Error("Audio source returned an empty response");

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_TELEGRAM_AUDIO_BYTES) {
        await reader.cancel();
        throw new Error("Audio exceeds Telegram's 50 MB bot upload limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  if (!totalBytes) throw new Error("Audio source returned an empty file");
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
}

async function ingestYouTubeFallback(params: {
  videoId: string;
  title: string;
  artist?: string;
}): Promise<UniversalAudioResult> {
  const { videoId, title, artist } = params;
  let audioBody: ReadableStream<Uint8Array> | null = null;
  let contentType = "audio/mp4";

  if (isYtDlpAvailable()) {
    const localAudio = streamAudioFromYouTube(videoId);
    audioBody = localAudio.stream;
    contentType = localAudio.mimeType || contentType;
  } else {
    const workerUrl = await getRemoteWorkerUrl();
    if (!workerUrl) {
      throw new Error("YouTube audio extraction is unavailable: no yt-dlp worker is connected");
    }
    const workerToken = process.env.REMOTE_STREAM_WORKER_TOKEN;
    if (!workerToken) {
      throw new Error("YouTube audio extraction is unavailable: REMOTE_STREAM_WORKER_TOKEN is not configured");
    }

    const workerParams = new URLSearchParams({
      videoId,
      title,
      proxy: "true",
      download: "true",
      forceYtDlp: "true",
    });
    if (artist) workerParams.set("artist", artist);

    const workerRes = await fetch(
      `${workerUrl.replace(/\/$/, "")}/api/ytdownload?${workerParams.toString()}`,
      {
        headers: {
          "User-Agent": "AuraMusic/1.0",
          Authorization: `Bearer ${workerToken}`,
        },
        signal: AbortSignal.timeout(45000),
      }
    );
    if (!workerRes.ok) {
      throw new Error(`yt-dlp worker returned HTTP ${workerRes.status}`);
    }
    audioBody = workerRes.body;
    contentType = workerRes.headers.get("content-type") || contentType;
  }

  const buffer = await readAudioBuffer(audioBody);
  const extension = contentType.includes("mpeg") ? "mp3" : "m4a";
  const uploaded = await uploadAudioBufferToTelegram({
    buffer,
    filename: `${title.replace(/[\/\\?%*:|"<>]/g, "_") || "song"}.${extension}`,
    title: title || "song",
    mimeType: contentType,
    artist,
    videoId,
  });
  if (!uploaded?.fileId) {
    throw new Error("Telegram storage upload failed; playback is blocked until the track is stored");
  }

  return {
    streamUrl: `/api/telegram/stream?fileId=${encodeURIComponent(uploaded.fileId)}&title=${encodeURIComponent(title || "song")}`,
    directPlay: false,
    source: "telegram",
    title: title || "song",
    artist,
    format: extension,
    mimeType: uploaded.mimeType || contentType,
  };
}

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

async function getFallbackVideoId(videoId?: string, title?: string, artist?: string): Promise<string | null> {
  if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) return videoId;
  const q = `${artist || ""} ${title || ""}`.trim();
  if (!q) return null;
  try {
    const { searchYouTube } = await import("@apis/youtubei.js");
    const [resOfficial, resStandard] = await Promise.all([
      searchYouTube(`${q} Official`).catch(() => null),
      searchYouTube(q).catch(() => null),
    ]);

    const candidates: any[] = [];
    for (const res of [resOfficial, resStandard]) {
      const songs = res?.songs || (res as any)?.videos || [];
      for (const item of songs) {
        const vid = item?.youtubeVideoId || item?.videoId || item?.id;
        if (vid && /^[a-zA-Z0-9_-]{11}$/.test(vid)) {
          candidates.push({
            youtubeVideoId: vid,
            title: item.title || "",
            artist: item.artist || item.author?.name || "",
            channel: item.author?.name || item.channel || "",
            durationSec: item.duration?.seconds || item.durationSec,
          });
        }
      }
    }

    const bestVid = findBestOfficialVideo(candidates, title || "", artist || "");
    if (bestVid) {
      console.log(`[getFallbackVideoId] 🎯 Selected official videoId=${bestVid} for "${title}" - "${artist}"`);
      return bestVid;
    }
  } catch (e: any) {
    console.warn("[getFallbackVideoId] YouTube search failed:", e.message);
  }
  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId") || searchParams.get("id") || undefined;
  let title = searchParams.get("title") || undefined;
  let artist = searchParams.get("artist") || undefined;
  const useProxy = searchParams.get("proxy") === "true";
  const resolveOnly = searchParams.get("resolveOnly") === "true";
  const isDownload = searchParams.get("download") === "true";
  const forceYtDlp = searchParams.get("forceYtDlp") === "true";

  // Clean generic placeholders
  if (title === "أغنية محفوظة" || title === "song") title = undefined;
  if (
    artist === "فنان" ||
    artist === "فنان غير معروف" ||
    artist === "غير معروف" ||
    artist?.toLowerCase().includes("unknown")
  ) {
    artist = undefined;
  }

  if (forceYtDlp) {
    if (!videoId || !/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      return NextResponse.json({ error: "A valid videoId is required for yt-dlp" }, { status: 400 });
    }
    if (!isYtDlpAvailable()) {
      return NextResponse.json({ error: "yt-dlp is unavailable on this worker" }, { status: 503 });
    }

    const { stream, mimeType } = streamAudioFromYouTube(videoId);
    const headers = new Headers(NO_CACHE_HEADERS);
    headers.set("Content-Type", mimeType || "audio/mp4");
    headers.set("Accept-Ranges", "bytes");
    headers.set("Content-Disposition", "inline");
    headers.set("Access-Control-Allow-Origin", "*");
    return new NextResponse(stream, { status: 200, headers });
  }

  // If title has "Artist - Song", extract both
  if (title && title.includes("-")) {
    const parts = title.split("-");
    if (parts[0].trim().length > 1 && parts[1].trim().length > 1) {
      if (!artist) artist = parts[0].trim();
      title = parts[1].trim();
    }
  }

  if (!videoId && !title) {
    return NextResponse.json({ error: "Missing videoId or title" }, { status: 400 });
  }

  try {
    const targetVideoId = await getFallbackVideoId(videoId, title, artist);
    let resolved: UniversalAudioResult;
    try {
      resolved = await resolveUniversalAudio({
        videoId: targetVideoId || videoId,
        title,
        artist,
        forDownload: isDownload,
      });
    } catch (resolveError) {
      const fallbackVideoId = targetVideoId || videoId;
      if (!fallbackVideoId || !/^[a-zA-Z0-9_-]{11}$/.test(fallbackVideoId)) throw resolveError;
      console.warn(
        `[ytdownload] Audio providers failed for "${title || fallbackVideoId}"; trying yt-dlp Telegram ingestion`
      );
      resolved = await ingestYouTubeFallback({
        videoId: fallbackVideoId,
        title: title || "song",
        artist,
      });
    }

    // Mode 1: Resolve only (for online player)
    if (resolveOnly) {
      let streamUrl = resolved.streamUrl;
      let directPlay = resolved.directPlay;

      // If YouTube, point directly to this /api/ytdownload endpoint which streams the actual audio
      if (resolved.source === "youtube" || streamUrl.includes("youtube.com") || streamUrl.includes("youtu.be")) {
        const vid = targetVideoId || videoId || resolved.videoId || "";
        streamUrl = `/api/ytdownload?videoId=${encodeURIComponent(vid)}&title=${encodeURIComponent(title || "")}&artist=${encodeURIComponent(artist || "")}&proxy=true`;
        directPlay = true;
      }

      return NextResponse.json(
        {
          url: streamUrl,
          directPlay,
          source: resolved.source,
          durationSec: resolved.durationSec,
        },
        {
          headers: {
            ...NO_CACHE_HEADERS,
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const isAttachment = req.nextUrl.searchParams.get("attachment") === "true" || isDownload;
    const trackName = title || resolved.title || "song";
    const fileExtension =
      resolved.format === "m4a" ||
      resolved.format === "mp4/aac" ||
      resolved.mimeType?.includes("audio/mp4")
        ? "m4a"
        : "mp3";
    const safeFilename =
      encodeURIComponent(trackName.replace(/[\/\\?%*:|"<>]/g, "_")) + `.${fileExtension}`;

    // Mode 1.5: If resolved source is Telegram Cloud CDN, stream / download directly from Telegram
    if (resolved.source === "telegram" || resolved.streamUrl.includes("/api/telegram/stream")) {
      const match = resolved.streamUrl.match(/fileId=([^&]+)/);
      const fileId = match ? decodeURIComponent(match[1]) : null;
      if (fileId) {
        const { getTelegramDirectUrl } = await import("@/services/telegram/telegramStorage");
        const directTgUrl = await getTelegramDirectUrl(fileId);
        if (directTgUrl) {
          const upstreamHeaders: Record<string, string> = { "User-Agent": "AuraMusic/1.0" };
          const clientRange = req.headers.get("Range");
          if (clientRange && !isDownload) {
            upstreamHeaders["Range"] = clientRange;
          }
          const tgRes = await fetch(directTgUrl, {
            headers: upstreamHeaders,
            signal: req.signal,
          });
          if (tgRes.ok || tgRes.status === 206) {
            const respHeaders = new Headers(NO_CACHE_HEADERS);
            tgRes.headers.forEach((val, key) => {
              const lower = key.toLowerCase();
              if (["content-type", "content-length", "content-range", "accept-ranges"].includes(lower)) {
                respHeaders.set(key, val);
              }
            });
            const telegramContentType = resolved.mimeType || tgRes.headers.get("content-type");
            respHeaders.set(
              "Content-Type",
              telegramContentType && telegramContentType !== "application/octet-stream"
                ? telegramContentType
                : "audio/mpeg"
            );
            respHeaders.set("Accept-Ranges", "bytes");
            respHeaders.set("Access-Control-Allow-Origin", "*");
            respHeaders.set(
              "Access-Control-Expose-Headers",
              "Content-Length, Content-Range, Accept-Ranges, Content-Disposition, X-Original-Content-Length"
            );
            if (isAttachment) {
              respHeaders.set(
                "Content-Disposition",
                `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`
              );
            } else {
              respHeaders.set("Content-Disposition", "inline");
            }
            const cl = respHeaders.get("content-length");
            if (cl) {
              respHeaders.set("X-Original-Content-Length", cl);
            }
            // iOS 2-byte probe safeguard
            if (clientRange === "bytes=0-1" && tgRes.status === 200 && tgRes.body) {
              try {
                const reader = tgRes.body.getReader();
                const { value } = await reader.read();
                reader.cancel().catch(() => {});
                if (value && value.length >= 2) {
                  const probeSlice = value.slice(0, 2);
                  respHeaders.set("Content-Range", `bytes 0-1/${cl || value.length}`);
                  respHeaders.set("Content-Length", "2");
                  return new NextResponse(probeSlice, { status: 206, headers: respHeaders });
                }
              } catch {}
            }
            return new NextResponse(tgRes.body as any, { status: tgRes.status, headers: respHeaders });
          }
        }
      }
    }

    // Mode 2: If resolved source is YouTube or raw googlevideo URL
    const isGoogleVideo = resolved.streamUrl.includes("googlevideo.com") || resolved.source === "youtube";
    if (isGoogleVideo) {
      const activeVid = targetVideoId || videoId || resolved.videoId;
      if (activeVid) {
        // If local yt-dlp is available (local machine), stream via yt-dlp
        if (isYtDlpAvailable()) {
          console.log(`[ytdownload] Direct yt-dlp audio stream for videoId=${activeVid}`);
          const { stream, mimeType } = streamAudioFromYouTube(activeVid);

          const responseHeaders = new Headers(NO_CACHE_HEADERS);
          responseHeaders.set("Content-Type", mimeType || "audio/mp4");
          responseHeaders.set("Access-Control-Allow-Origin", "*");
          responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Disposition, X-Original-Content-Length");
          responseHeaders.set("Accept-Ranges", "bytes");
          responseHeaders.set("Content-Disposition", isAttachment ? `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}` : "inline");

          return new NextResponse(stream as any, {
            status: 200,
            headers: responseHeaders,
          });
        }

        // If on Vercel without yt-dlp: check if remote worker tunnel is active
        const workerUrl = await getRemoteWorkerUrl();
        if (workerUrl) {
          console.log(`[ytdownload] Proxying audio from active remote worker: ${workerUrl}`);
          const workerParams = new URLSearchParams();
          workerParams.set("videoId", activeVid);
          if (title) workerParams.set("title", title);
          if (artist) workerParams.set("artist", artist);
          if (isDownload) workerParams.set("download", "true");
          workerParams.set("proxy", "true");

          const forwardHeaders: Record<string, string> = {
            "User-Agent": "AuraMusic/1.0",
          };
          const clientRange = req.headers.get("Range");
          if (clientRange) {
            forwardHeaders["Range"] = clientRange;
          }

          const workerRes = await fetch(`${workerUrl}/api/ytdownload?${workerParams.toString()}`, {
            headers: forwardHeaders,
            signal: req.signal,
          });
          if (workerRes.ok || workerRes.status === 206) {
            const workerHeaders = new Headers(NO_CACHE_HEADERS);
            workerHeaders.set("Content-Type", workerRes.headers.get("content-type") || "audio/mp4");
            workerHeaders.set("Access-Control-Allow-Origin", "*");
            workerHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Disposition, X-Original-Content-Length");
            workerHeaders.set("Accept-Ranges", "bytes");
            workerHeaders.set("Content-Disposition", isAttachment ? `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}` : "inline");

            const cr = workerRes.headers.get("content-range");
            if (cr) workerHeaders.set("Content-Range", cr);

            const cl = workerRes.headers.get("content-length") || workerRes.headers.get("x-original-content-length");
            if (cl) {
              workerHeaders.set("Content-Length", cl);
              workerHeaders.set("X-Original-Content-Length", cl);
            }

            return new NextResponse(workerRes.body as any, { status: workerRes.status, headers: workerHeaders });
          }
        }
      }

      // If YouTube source reached here without worker or yt-dlp, attempt fast direct resolution
      if (resolved.streamUrl.includes("youtube.com") || resolved.streamUrl.includes("youtu.be")) {
        try {
          const { resolveAlbumatyStream } = await import("@/services/scrapers/albumaty");
          const albumatyUrl = await resolveAlbumatyStream(title || "", artist || "");
          if (albumatyUrl) {
            resolved.streamUrl = albumatyUrl;
            resolved.source = "albumaty";
          }
        } catch {}

        if (resolved.streamUrl.includes("youtube.com") || resolved.streamUrl.includes("youtu.be")) {
          try {
            const { resolveSaavnSong } = await import("@/services/music/jiosaavn");
            const saavn = await resolveSaavnSong(title || "", artist);
            if (saavn?.streamUrl) {
              resolved.streamUrl = saavn.streamUrl;
              resolved.source = "jiosaavn";
            }
          } catch {}
        }

        if (resolved.streamUrl.includes("youtube.com") || resolved.streamUrl.includes("youtu.be")) {
          try {
            const { resolveSoundCloudStream } = await import("@/services/scrapers/soundcloud");
            const sc = await resolveSoundCloudStream(title || "", artist || "");
            if (sc) {
              resolved.streamUrl = sc;
              resolved.source = "soundcloud";
            }
          } catch {}
        }

        if (resolved.streamUrl.includes("youtube.com") || resolved.streamUrl.includes("youtu.be")) {
          return NextResponse.json(
            { error: "سيرفر الاستخراج غير متصل، يرجى تشغيل برنامج خادم الصوت Aura Music Link أو تجربة أغنية أخرى" },
            { status: 503 }
          );
        }
      }
    }

    // Mode 3: Direct CDN fetch (Albumaty, JioSaavn, SoundCloud)
    const upstreamHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    };

    if (resolved.source === "albumaty") {
      upstreamHeaders["Referer"] = "https://www.albumaty.com/";
    }

    const clientRange = req.headers.get("Range");
    if (clientRange && !isDownload) {
      upstreamHeaders["Range"] = clientRange;
    }

    const targetStreamUrl = resolved.streamUrl.startsWith("/")
      ? new URL(resolved.streamUrl, req.url).toString()
      : resolved.streamUrl;

    let upstreamRes = await fetch(targetStreamUrl, {
      cache: "no-store",
      headers: upstreamHeaders,
      signal: req.signal,
    });

    // If upstream returns 403 or fails, fallback to yt-dlp or remote worker
    if (!upstreamRes.ok || upstreamRes.status === 403) {
      const targetVideoId = await getFallbackVideoId(videoId || resolved.videoId, title, artist);
      if (targetVideoId) {
        if (isYtDlpAvailable()) {
          console.warn(`[ytdownload] Upstream failed (${upstreamRes.status}), falling back to local yt-dlp...`);
          const { stream, mimeType } = streamAudioFromYouTube(targetVideoId);
          const fallbackHeaders = new Headers(NO_CACHE_HEADERS);
          fallbackHeaders.set("Content-Type", mimeType || "audio/mp4");
          fallbackHeaders.set("Access-Control-Allow-Origin", "*");
          fallbackHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Disposition, X-Original-Content-Length");
          fallbackHeaders.set("Accept-Ranges", "bytes");
          fallbackHeaders.set("Content-Disposition", isAttachment ? `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}` : "inline");
          return new NextResponse(stream as any, { status: 200, headers: fallbackHeaders });
        }

        const workerUrl = await getRemoteWorkerUrl();
        if (workerUrl) {
          console.warn(`[ytdownload] Upstream failed (${upstreamRes.status}), falling back to remote worker: ${workerUrl}...`);
          const workerParams = new URLSearchParams();
          workerParams.set("videoId", targetVideoId);
          if (title) workerParams.set("title", title);
          if (artist) workerParams.set("artist", artist);
          workerParams.set("download", "true");
          workerParams.set("proxy", "true");

          const workerRes = await fetch(`${workerUrl}/api/ytdownload?${workerParams.toString()}`, {
            headers: { "User-Agent": "AuraMusic/1.0" },
            signal: req.signal,
          });
          if (workerRes.ok && workerRes.body) {
            const workerHeaders = new Headers(NO_CACHE_HEADERS);
            workerHeaders.set("Content-Type", workerRes.headers.get("content-type") || "audio/mp4");
            workerHeaders.set("Access-Control-Allow-Origin", "*");
            workerHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Disposition, X-Original-Content-Length");
            workerHeaders.set("Accept-Ranges", "bytes");
            workerHeaders.set("Content-Disposition", isAttachment ? `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}` : "inline");
            const cl = workerRes.headers.get("content-length") || workerRes.headers.get("x-original-content-length");
            if (cl) {
              workerHeaders.set("Content-Length", cl);
              workerHeaders.set("X-Original-Content-Length", cl);
            }
            return new NextResponse(workerRes.body as any, { status: 200, headers: workerHeaders });
          }
        }
      }
    }

    const responseHeaders = new Headers();
    upstreamRes.headers.forEach((val, key) => {
      const lower = key.toLowerCase();
      if (["content-type", "content-length", "content-range", "accept-ranges"].includes(lower)) {
        responseHeaders.set(key, val);
      }
    });

    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges, Content-Disposition, X-Original-Content-Length");
    responseHeaders.set("Accept-Ranges", "bytes");

    if (isAttachment) {
      responseHeaders.set("Content-Disposition", `attachment; filename="${safeFilename}"; filename*=UTF-8''${safeFilename}`);
    } else {
      responseHeaders.set("Content-Disposition", "inline");
    }

    if (!responseHeaders.get("content-type") || responseHeaders.get("content-type") === "application/octet-stream") {
      responseHeaders.set("content-type", resolved.mimeType || "audio/mpeg");
    }

    const cLen = responseHeaders.get("content-length");
    if (cLen) {
      responseHeaders.set("X-Original-Content-Length", cLen);
    }

    // Special safeguard for Safari / iOS Range probe (bytes=0-1):
    // If upstream returns 200 instead of 206, synthesize 206 for the 2-byte probe to prevent Safari stall
    if (clientRange === "bytes=0-1" && upstreamRes.status === 200 && upstreamRes.body) {
      try {
        const reader = upstreamRes.body.getReader();
        const { value } = await reader.read();
        reader.cancel().catch(() => {});
        if (value && value.length >= 2) {
          const probeSlice = value.slice(0, 2);
          responseHeaders.set("Content-Range", `bytes 0-1/${cLen || value.length}`);
          responseHeaders.set("Content-Length", "2");
          return new NextResponse(probeSlice, {
            status: 206,
            headers: responseHeaders,
          });
        }
      } catch {}
    }

    return new NextResponse(upstreamRes.body, {
      status: upstreamRes.status,
      headers: responseHeaders,
    });
  } catch (error: any) {
    if (error.name === "AbortError" || req.signal.aborted) {
      return new NextResponse(null, { status: 499 });
    }
    console.error("[ytdownload] Fatal Error:", error.message);
    return NextResponse.json(
      { error: "Audio extraction failed", details: error.message },
      { status: 500 }
    );
  }
}
