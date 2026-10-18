import { NextRequest, NextResponse } from "next/server";
import { resolveUniversalAudio } from "@/services/music/universalAudioResolver";
import { streamAudioFromYouTube, isYtDlpAvailable } from "@apis/yt-dlp";

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

  // 1. Check environment variable
  if (process.env.REMOTE_STREAM_WORKER) {
    const isOk = await checkWorkerHealth(process.env.REMOTE_STREAM_WORKER);
    if (isOk) {
      lastKnownWorkerUrl = process.env.REMOTE_STREAM_WORKER;
      lastWorkerCheck = Date.now();
      return lastKnownWorkerUrl;
    }
  }

  // 2. Check Neon Database system_config table (where auto-start.js records active tunnel)
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
  const q = `${title || ""} ${artist || ""}`.trim();
  if (!q) return null;
  try {
    const { searchYouTube } = await import("@apis/youtubei.js");
    const res = await searchYouTube(q);
    const songs = res.songs || (res as any).videos || [];
    if (songs.length === 0) return null;

    const normTitle = normalizeText(title || "");
    const normArtist = normalizeText(artist || "");
    const titleWords = normTitle.split(" ").filter((w: string) => w.length > 1);
    const artistWords = normArtist.split(" ").filter((w: string) => w.length > 1);

    for (const item of songs) {
      const vid = item?.youtubeVideoId || item?.videoId || item?.id;
      if (!vid || !/^[a-zA-Z0-9_-]{11}$/.test(vid)) continue;

      const fullText = normalizeText(`${item.title || ""} ${item.artist || item.author?.name || ""}`);

      // Must match title words if title was provided
      if (titleWords.length > 0 && !titleWords.every((w: string) => fullText.includes(w))) {
        continue;
      }

      // Must match artist words if artist was provided
      if (artistWords.length > 0 && !artistWords.some((w: string) => fullText.includes(w))) {
        continue;
      }

      return vid;
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
    const resolved = await resolveUniversalAudio({ videoId: targetVideoId || videoId, title, artist, forDownload: isDownload });

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
    const safeFilename = encodeURIComponent(trackName.replace(/[\/\\?%*:|"<>]/g, "_")) + ".mp3";

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
    if (clientRange && !useProxy) {
      upstreamHeaders["Range"] = clientRange;
    }

    let upstreamRes = await fetch(resolved.streamUrl, {
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
      responseHeaders.set("content-type", "audio/mpeg");
    }

    const cLen = responseHeaders.get("content-length");
    if (cLen) {
      responseHeaders.set("X-Original-Content-Length", cLen);
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
