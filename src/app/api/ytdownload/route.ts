import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

// ── Strategy 1: @distube/ytdl-core — best URL extraction on any server ────────
async function resolveWithYtdlCore(videoId: string): Promise<string | null> {
  try {
    const ytdl = await import("@distube/ytdl-core");
    const info = await ytdl.default.getInfo(
      `https://www.youtube.com/watch?v=${videoId}`,
      {
        requestOptions: {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Accept-Language": "en-US,en;q=0.9",
            ...(process.env.YOUTUBE_COOKIE
              ? { Cookie: process.env.YOUTUBE_COOKIE }
              : {}),
          },
        },
      }
    );

    // Try audio-only first, fall back to formats with audio
    let formats = ytdl.default
      .filterFormats(info.formats, "audioonly")
      .filter((f: any) => f.url)
      .sort((a: any, b: any) => (b.audioBitrate ?? 0) - (a.audioBitrate ?? 0));

    // If no audio-only with URL, try all formats that have audio
    if (formats.length === 0) {
      formats = info.formats
        .filter((f: any) => f.url && f.hasAudio)
        .sort(
          (a: any, b: any) => (b.audioBitrate ?? 0) - (a.audioBitrate ?? 0)
        );
    }

    if (formats.length > 0 && formats[0].url) {
      console.log(
        `[ytdownload] ytdl-core resolved (${formats[0].container}, ${formats[0].audioBitrate}kbps)`
      );
      return formats[0].url;
    }
  } catch (e: any) {
    console.warn("[ytdownload] ytdl-core failed:", e.message?.slice(0, 120));
  }
  return null;
}

// ── Strategy 2: Invidious public pool ─────────────────────────────────────────
const INVIDIOUS_INSTANCES = [
  "https://inv.pistasjis.net",
  "https://invidious.flokinet.to",
  "https://invidious.privacydev.net",
  "https://iv.ggtyler.dev",
  "https://invidious.projectsegfau.lt",
  "https://invidious.nerdvpn.de",
  "https://invidious.lunar.icu",
  "https://vid.puffyan.us",
];

async function resolveWithInvidious(videoId: string): Promise<string | null> {
  try {
    const url = await Promise.any(
      INVIDIOUS_INSTANCES.map(async (instance) => {
        const res = await fetch(`${instance}/api/v1/videos/${videoId}`, {
          signal: AbortSignal.timeout(7000),
          headers: { "User-Agent": "Mozilla/5.0" },
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`${instance}: ${res.status}`);
        const data = await res.json();
        const formats: any[] = data.adaptiveFormats ?? [];
        const best =
          formats.find(
            (f: any) =>
              f.type?.includes("audio/webm") &&
              f.audioQuality === "AUDIO_QUALITY_MEDIUM"
          ) ??
          formats.find((f: any) => f.type?.includes("audio/webm")) ??
          formats.find((f: any) => f.type?.includes("audio/mp4")) ??
          formats.find((f: any) => f.type?.includes("audio"));
        if (best?.url) {
          console.log(`[ytdownload] Invidious resolved via ${instance}`);
          return best.url as string;
        }
        throw new Error("no audio format");
      })
    );
    return url;
  } catch {
    return null;
  }
}

// ── Strategy 3: Piped API pool ────────────────────────────────────────────────
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://piped-api.garudalinux.org",
  "https://pipedapi.moomoo.me",
  "https://pipedapi.kescher.at",
];

async function resolveWithPiped(videoId: string): Promise<string | null> {
  try {
    const url = await Promise.any(
      PIPED_INSTANCES.map(async (api) => {
        const res = await fetch(`${api}/streams/${videoId}`, {
          signal: AbortSignal.timeout(7000),
          headers: { "User-Agent": "Mozilla/5.0", Accept: "application/json" },
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`${api}: ${res.status}`);
        const data = await res.json();
        const streams: any[] = data.audioStreams ?? [];
        const best = streams
          .filter((s: any) => s.url)
          .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
        if (best?.url) {
          console.log(`[ytdownload] Piped resolved via ${api}`);
          return best.url as string;
        }
        throw new Error("no audio stream");
      })
    );
    return url;
  } catch {
    return null;
  }
}

// ── Strategy 4: youtubei.js InnerTube ─────────────────────────────────────────
async function resolveWithYoutubei(videoId: string): Promise<string | null> {
  try {
    const { resolveStream } = await import("@/../apis/youtubei.js/index");
    const url = await resolveStream(videoId);
    if (url) {
      console.log(`[ytdownload] youtubei.js resolved`);
      return url;
    }
  } catch (e: any) {
    console.warn("[ytdownload] youtubei.js failed:", e.message?.slice(0, 100));
  }
  return null;
}

// ── Proxy audio stream back to browser ────────────────────────────────────────
async function proxyAudioUrl(
  audioUrl: string,
  signal: AbortSignal
): Promise<NextResponse> {
  const upstream = await fetch(audioUrl, {
    cache: "no-store",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      Range: "bytes=0-",
    },
    signal,
  });

  if (!upstream.ok) {
    throw new Error(`Upstream fetch failed: ${upstream.status} for ${audioUrl.slice(0, 60)}`);
  }

  const headers = new Headers(NO_CACHE_HEADERS);

  ["content-type", "content-length", "content-range", "accept-ranges"].forEach(
    (key) => {
      const val = upstream.headers.get(key);
      if (val) headers.set(key, val);
    }
  );

  if (!headers.has("content-type")) headers.set("content-type", "audio/mpeg");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges, X-Original-Content-Length"
  );

  const cl = headers.get("content-length");
  headers.set("X-Original-Content-Length", cl ?? String(3.5 * 1024 * 1024));
  if (!cl) headers.set("Transfer-Encoding", "chunked");

  return new NextResponse(upstream.body, { headers });
}

// ── Main GET handler ──────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");
  const title = searchParams.get("title") ?? "";
  const artist = searchParams.get("artist") ?? "";

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  console.log(`[ytdownload] Downloading: "${title}" by "${artist}" (${videoId})`);

  try {
    // 1. ytdl-core — most reliable, gets URL directly from YouTube API
    const ytdlUrl = await resolveWithYtdlCore(videoId);
    if (ytdlUrl) {
      return await proxyAudioUrl(ytdlUrl, req.signal);
    }

    // 2. Invidious pool
    const invidiousUrl = await resolveWithInvidious(videoId);
    if (invidiousUrl) {
      return await proxyAudioUrl(invidiousUrl, req.signal);
    }

    // 3. Piped API pool
    const pipedUrl = await resolveWithPiped(videoId);
    if (pipedUrl) {
      return await proxyAudioUrl(pipedUrl, req.signal);
    }

    // 4. youtubei.js (last resort)
    const ytjsUrl = await resolveWithYoutubei(videoId);
    if (ytjsUrl) {
      return await proxyAudioUrl(ytjsUrl, req.signal);
    }

    throw new Error("All resolvers failed — no audio URL found");
  } catch (error: any) {
    if (error.name === "AbortError") {
      return NextResponse.json(
        { error: "Request cancelled" },
        { status: 499, headers: NO_CACHE_HEADERS }
      );
    }
    console.error("[ytdownload] Fatal error:", error.message);
    return NextResponse.json(
      { error: "Failed to download audio", details: error.message },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
