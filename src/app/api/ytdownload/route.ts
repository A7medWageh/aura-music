import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge";

const RAPIDAPI_KEY = "06927991ffmshcbe63a93c7bc4a5p1cc0a0jsn330d37766afa";
const RAPIDAPI_HOST = "youtube-mp3-audio-video-downloader.p.rapidapi.com";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store",
};

// ── Resolve audio URL from RapidAPI ────────────────────────────────────────────
async function resolveAudioUrl(videoId: string): Promise<string | null> {
  const rapidApiUrl = `https://${RAPIDAPI_HOST}/get_m4a_download_link/${videoId}`;
  const res = await fetch(rapidApiUrl, {
    headers: {
      "x-rapidapi-host": RAPIDAPI_HOST,
      "x-rapidapi-key": RAPIDAPI_KEY,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.file ?? null;
}

// ── Proxy audio stream (used by offline downloader) ───────────────────────────
async function proxyAudioUrl(
  audioUrl: string,
  req: NextRequest
): Promise<Response> {
  const clientRange = req.headers.get("range") || "bytes=0-";

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(new Error("Proxy Fetch Timeout")),
    8000
  );
  req.signal.addEventListener("abort", () => controller.abort(), { once: true });

  try {
    const upstream = await fetch(audioUrl, {
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Range: clientRange,
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!upstream.ok && upstream.status !== 206) {
      throw new Error(`Upstream fetch failed: ${upstream.status}`);
    }

    const headers = new Headers(NO_CACHE_HEADERS);
    ["content-type", "content-length", "content-range", "accept-ranges"].forEach((key) => {
      const val = upstream.headers.get(key);
      if (val) headers.set(key, val);
    });

    if (!headers.has("content-type")) headers.set("content-type", "audio/mpeg");
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set(
      "Access-Control-Expose-Headers",
      "Content-Length, Content-Range, Accept-Ranges"
    );
    const cl = headers.get("content-length");
    if (!cl) headers.set("Transfer-Encoding", "chunked");

    return new Response(upstream.body, {
      status: upstream.status === 206 ? 206 : 200,
      headers,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
}

// ── Main GET handler ──────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");
  const useProxy = searchParams.get("proxy") === "true";
  const resolveOnly = searchParams.get("resolveOnly") === "true";

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  try {
    const audioUrl = await resolveAudioUrl(videoId);
    if (!audioUrl) throw new Error("Failed to extract download URL from RapidAPI.");

    // Mode 1: Just resolve and return the CDN URL (for online player)
    if (resolveOnly) {
      // Probe upstream to get content-length for duration hints
      let contentLength: number | null = null;
      try {
        const probe = await fetch(audioUrl, { method: "HEAD" });
        const cl = probe.headers.get("content-length");
        if (cl) contentLength = parseInt(cl);
      } catch {}

      return NextResponse.json({ url: audioUrl, contentLength }, {
        headers: {
          ...NO_CACHE_HEADERS,
          "Access-Control-Allow-Origin": "*",
        }
      });
    }

    // Mode 2: Proxy stream (for offline downloader that reads body bytes)
    if (useProxy) {
      return await proxyAudioUrl(audioUrl, req);
    }

    // Mode 3: Direct redirect (fallback for anything else)
    return NextResponse.redirect(audioUrl, 307);
  } catch (error: any) {
    console.error("[ytdownload] Fatal Error:", error.message);
    return NextResponse.json(
      { error: "Audio extraction failed", details: error.message },
      { status: 500 }
    );
  }
}
