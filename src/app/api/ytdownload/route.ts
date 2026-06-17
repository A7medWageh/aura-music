import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "Pragma": "no-cache",
  "Expires": "0",
};

// ── Strategy 1: Albumaty (Arabic MP3 scraper — fastest & most reliable on Vercel) ──
async function resolveWithAlbumaty(title: string, artist: string): Promise<string | null> {
  try {
    const { scrapeArabicSong } = await import("@/../apis/scraping/arabicScraper");
    const result = await scrapeArabicSong(title, artist);
    if (result?.url) {
      console.log(`[ytdownload] Albumaty resolved: ${result.url.slice(0, 80)}...`);
      return result.url;
    }
  } catch (e: any) {
    console.warn("[ytdownload] Albumaty failed:", e.message);
  }
  return null;
}

// ── Strategy 2: Invidious public pool (googlevideo proxy — bypasses YouTube IP blocks) ──
const INVIDIOUS_INSTANCES = [
  "https://inv.pistasjis.net",
  "https://invidious.flokinet.to",
  "https://invidious.privacydev.net",
  "https://iv.ggtyler.dev",
  "https://invidious.projectsegfau.lt",
  "https://invidious.nerdvpn.de",
  "https://yt.artemislena.eu",
  "https://invidious.lunar.icu",
];

async function resolveWithInvidious(videoId: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const result = await Promise.any(
      INVIDIOUS_INSTANCES.map(async (instance) => {
        const res = await fetch(`${instance}/api/v1/videos/${videoId}`, {
          signal: controller.signal,
          headers: { "User-Agent": "Mozilla/5.0" },
          cache: "no-store",
        });
        if (!res.ok) throw new Error(`${instance}: ${res.status}`);
        const data = await res.json();
        const formats: any[] = data.adaptiveFormats ?? [];
        // Prefer webm/opus, fallback to any audio
        const best =
          formats.find((f: any) => f.type?.includes("audio/webm") && f.audioQuality === "AUDIO_QUALITY_MEDIUM") ??
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
    clearTimeout(timeout);
    return result;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ── Strategy 3: Piped API pool ──
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://piped-api.garudalinux.org",
  "https://pipedapi.moomoo.me",
  "https://pipedapi.kescher.at",
];

async function resolveWithPiped(videoId: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const result = await Promise.any(
      PIPED_INSTANCES.map(async (api) => {
        const res = await fetch(`${api}/streams/${videoId}`, {
          signal: controller.signal,
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
    clearTimeout(timeout);
    return result;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// ── Strategy 4: youtubei.js (last resort, may be IP-blocked on Vercel) ──
async function resolveWithYoutubei(videoId: string): Promise<string | null> {
  try {
    const { resolveStream } = await import("@/../apis/youtubei.js/index");
    const url = await resolveStream(videoId);
    if (url) {
      console.log(`[ytdownload] youtubei.js resolved`);
      return url;
    }
  } catch (e: any) {
    console.warn("[ytdownload] youtubei.js failed:", e.message);
  }
  return null;
}

// ── Proxy the audio stream back to the browser ───────────────────────────────
async function proxyAudioUrl(
  audioUrl: string,
  signal: AbortSignal
): Promise<NextResponse> {
  const upstream = await fetch(audioUrl, {
    cache: "no-store",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Range": "bytes=0-",
    },
    signal,
  });

  if (!upstream.ok) {
    throw new Error(`Upstream fetch failed: ${upstream.status}`);
  }

  const headers = new Headers(NO_CACHE_HEADERS);

  // Forward useful headers
  ["content-type", "content-length", "content-range", "accept-ranges"].forEach((key) => {
    const val = upstream.headers.get(key);
    if (val) headers.set(key, val);
  });

  if (!headers.has("content-type")) headers.set("content-type", "audio/mpeg");
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set(
    "Access-Control-Expose-Headers",
    "Content-Length, Content-Range, Accept-Ranges, X-Original-Content-Length"
  );

  const contentLength = headers.get("content-length");
  headers.set(
    "X-Original-Content-Length",
    contentLength ?? String(3.5 * 1024 * 1024)
  );
  if (!contentLength) headers.set("Transfer-Encoding", "chunked");

  return new NextResponse(upstream.body, { headers });
}

// ── Main handler ──────────────────────────────────────────────────────────────
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
    // 1. Albumaty — direct MP3, no YouTube IP issues
    if (title) {
      const albumatyUrl = await resolveWithAlbumaty(title, artist);
      if (albumatyUrl) {
        return await proxyAudioUrl(albumatyUrl, req.signal);
      }
    }

    // 2. Invidious pool — proxied YouTube audio
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
