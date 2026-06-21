import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "edge";

// The user will set this to their new Railway backend URL (e.g., https://aura-backend.up.railway.app)
const AURA_BACKEND_URL = process.env.AURA_BACKEND_URL || "http://127.0.0.1:3001";

const NO_CACHE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  Pragma: "no-cache",
  Expires: "0",
  "Surrogate-Control": "no-store",
};

// ── Main GET handler ──────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const videoId = searchParams.get("videoId");
  const useProxy = searchParams.get("proxy") === "true";
  const resolveOnly = searchParams.get("resolveOnly") === "true";

  if (!videoId) {
    return NextResponse.json({ error: "Missing videoId" }, { status: 400 });
  }

  const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    // Mode 1: Just resolve and return the CDN URL (for online player)
    if (resolveOnly) {
      const resolveApi = `${AURA_BACKEND_URL}/api/resolve?url=${encodeURIComponent(targetUrl)}`;
      const res = await fetch(resolveApi);
      if (!res.ok) throw new Error("Backend resolve failed");
      
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      // Probe upstream to get content-length for duration hints
      let contentLength: number | null = null;
      try {
        const probe = await fetch(data.download_url, { method: "HEAD" });
        const cl = probe.headers.get("content-length");
        if (cl) contentLength = parseInt(cl);
      } catch {}

      return NextResponse.json({ url: data.download_url, contentLength }, {
        headers: {
          ...NO_CACHE_HEADERS,
          "Access-Control-Allow-Origin": "*",
        }
      });
    }

    // Mode 2: Proxy stream (for offline downloader that reads body bytes)
    // We can just redirect the client to the backend's download route!
    if (useProxy) {
        const downloadApi = `${AURA_BACKEND_URL}/api/download?url=${encodeURIComponent(targetUrl)}`;
        return NextResponse.redirect(downloadApi, 307);
    }

    // Mode 3: Direct redirect (fallback for anything else)
    const resolveApi = `${AURA_BACKEND_URL}/api/resolve?url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(resolveApi);
    const data = await res.json();
    return NextResponse.redirect(data.download_url, 307);
    
  } catch (error: any) {
    console.error("[ytdownload] Fatal Error:", error.message);
    return NextResponse.json(
      { error: "Audio extraction failed", details: error.message },
      { status: 500 }
    );
  }
}

