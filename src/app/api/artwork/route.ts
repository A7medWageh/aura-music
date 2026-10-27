import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { JANNAT_OLD_CLASSICS } from "@/data/jannatClassics";
import { ANGHAM_OLD_CLASSICS } from "@/data/anghamClassics";

export const dynamic = "force-dynamic";

let fallbackJpg: Buffer | null = null;
function getFallbackJpg(): Buffer {
  if (!fallbackJpg) {
    try {
      fallbackJpg = fs.readFileSync(path.join(process.cwd(), "public", "placeholder-album.jpg"));
    } catch {
      fallbackJpg = Buffer.alloc(0);
    }
  }
  return fallbackJpg;
}

const artworkCache = new Map<string, string>();

function cleanTitleForSearch(title: string): string {
  if (!title) return "";
  return title
    .replace(/\s*(\(|\[)[^()\[\]]*(official|video|audio|lyrics|كلمات|كليب|فيديو|حصري|نسخة|أصلية)[^()\[\]]*(\)|\])/gi, "")
    .replace(/\b(hd|hq|4k|1080p|720p|audio|lyrics)\b/gi, "")
    .replace(/[-|–].*$/g, "")
    .trim();
}

async function fetchItunesArtwork(title: string, artist?: string): Promise<string | null> {
  const cleanTitle = cleanTitleForSearch(title);
  const cleanArtist = (artist || "")
    .replace(/\s*-\s*topic/gi, "")
    .replace(/\s*(official|channel|قناة|رسمي)/gi, "")
    .trim();

  const queries = [
    `${cleanArtist} ${cleanTitle}`.trim(),
    cleanTitle,
  ].filter(Boolean);

  for (const q of queries) {
    const cacheKey = q.toLowerCase();
    if (artworkCache.has(cacheKey)) {
      return artworkCache.get(cacheKey)!;
    }

    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=1`,
        {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          },
          signal: AbortSignal.timeout(3500),
        }
      );
      if (!res.ok) continue;
      const data = await res.json();
      const raw = data.results?.[0]?.artworkUrl100;
      if (raw && typeof raw === "string") {
        const hd = raw.replace(/100x100bb/i, "1000x1000bb");
        artworkCache.set(cacheKey, hd);
        return hd;
      }
    } catch {
      // Continue to next query
    }
  }

  return null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get("url");
  let songId = searchParams.get("songId");
  const title = searchParams.get("title");
  const artist = searchParams.get("artist");

  let imageUrl = targetUrl;

  // Extract songId from YouTube URL if not passed explicitly
  if (!songId && imageUrl && imageUrl.includes("i.ytimg.com/vi/")) {
    const match = imageUrl.match(/i\.ytimg\.com\/vi\/([^/]+)\//);
    if (match) songId = match[1];
  }

  // 1. If imageUrl is missing, blob, data, or generic placeholder: resolve it
  const isInvalidUrl =
    !imageUrl ||
    imageUrl.startsWith("blob:") ||
    imageUrl.startsWith("data:") ||
    imageUrl.includes("placeholder-") ||
    imageUrl === "/placeholder-album.jpg";

  if (isInvalidUrl) {
    // 1A. Check classic catalogs (Jannat & Angham verified 1000x1000 covers)
    if (songId || title) {
      const jannat = JANNAT_OLD_CLASSICS.find(
        (c) => (songId && (c.songId === songId || c.youtubeVideoId === songId)) || (title && c.title === title)
      );
      if (jannat?.thumbnailUrl) {
        imageUrl = jannat.thumbnailUrl;
      } else {
        const angham = ANGHAM_OLD_CLASSICS.find(
          (c) => (songId && (c.songId === songId || c.youtubeVideoId === songId)) || (title && c.title === title)
        );
        if (angham?.thumbnailUrl) {
          imageUrl = angham.thumbnailUrl;
        }
      }
    }

    // 1B. Query iTunes Search API for ultra-HD (1000x1000) official album artwork
    if ((!imageUrl || isInvalidUrl) && (title || artist)) {
      const itunesCover = await fetchItunesArtwork(title || "", artist || "");
      if (itunesCover) {
        imageUrl = itunesCover;
      }
    }

    // 1C. If YouTube video ID is available, use YouTube maxresdefault or hqdefault
    if ((!imageUrl || isInvalidUrl) && songId && /^[a-zA-Z0-9_-]{11}$/.test(songId)) {
      imageUrl = `https://i.ytimg.com/vi/${songId}/hqdefault.jpg`;
    }
  } else if (imageUrl && imageUrl.includes("ytimg.com") && (title || artist)) {
    // 2. If it's a YouTube thumbnail, check if iTunes has an official 1000x1000 square cover
    const itunesCover = await fetchItunesArtwork(title || "", artist || "");
    if (itunesCover) {
      imageUrl = itunesCover;
    }
  }

  // 3. Fallback to placeholder if resolution failed
  if (!imageUrl || imageUrl.startsWith("blob:") || imageUrl.startsWith("data:") || imageUrl.includes("placeholder-")) {
    const buf = getFallbackJpg();
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // 4. Proxy the image
  try {
    const decodedUrl = decodeURIComponent(imageUrl);

    // If local relative file
    if (decodedUrl.startsWith("/")) {
      const filePath = path.join(process.cwd(), "public", decodedUrl.replace(/^\/+/, ""));
      if (fs.existsSync(filePath)) {
        const fileBuf = fs.readFileSync(filePath);
        return new NextResponse(new Uint8Array(fileBuf), {
          status: 200,
          headers: {
            "Content-Type": decodedUrl.endsWith(".png") ? "image/png" : "image/jpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
            "Access-Control-Allow-Origin": "*",
          },
        });
      }
    }

    const res = await fetch(decodedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
        Accept: "image/jpeg,image/png,image/*;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      // If 1000x1000 returned 404, try 600x600 or fallback
      if (decodedUrl.includes("1000x1000bb")) {
        const retryRes = await fetch(decodedUrl.replace("1000x1000bb", "600x600bb"), {
          signal: AbortSignal.timeout(6000),
        });
        if (retryRes.ok) {
          const ct = retryRes.headers.get("content-type") || "image/jpeg";
          const ab = await retryRes.arrayBuffer();
          return new NextResponse(new Uint8Array(ab), {
            status: 200,
            headers: {
              "Content-Type": ct.includes("png") ? "image/png" : "image/jpeg",
              "Cache-Control": "public, max-age=31536000, immutable",
              "Access-Control-Allow-Origin": "*",
            },
          });
        }
      }
      throw new Error(`Upstream returned ${res.status}`);
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await res.arrayBuffer();

    return new NextResponse(new Uint8Array(arrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": contentType.includes("png") ? "image/png" : "image/jpeg",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err: any) {
    console.warn("[Artwork] Failed to proxy image, using fallback:", err.message);
    const buf = getFallbackJpg();
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=3600",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
}
