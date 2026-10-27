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

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const targetUrl = searchParams.get("url");
  const songId = searchParams.get("songId");
  const title = searchParams.get("title");
  const artist = searchParams.get("artist");

  let imageUrl = targetUrl;

  // 1. Resolve classic catalog high-res artwork if songId or title matches
  if (!imageUrl || imageUrl.startsWith("blob:") || imageUrl.startsWith("data:")) {
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
  }

  // 2. If imageUrl is still empty or local placeholder, serve high-res fallback
  if (!imageUrl || imageUrl.startsWith("blob:") || imageUrl.startsWith("data:") || imageUrl.includes("placeholder")) {
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
        "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1",
        "Accept": "image/jpeg,image/png,image/*;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`Upstream returned ${res.status}`);
    }

    const contentType = res.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await res.arrayBuffer();

    return new NextResponse(arrayBuffer, {
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
