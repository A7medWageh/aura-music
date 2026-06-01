import { NextRequest, NextResponse } from "next/server";
import { getAlbumDetails } from "@apis/youtubei.js";
import { checkRateLimit } from "@/services/security/rateLimit";
import { fail } from "@/services/http/response";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const rate = await checkRateLimit(req, { key: "album_api", max: 100, windowSec: 60 });
  if (!rate.allowed) return fail("RATE_LIMITED", "Too many requests", 429);

  try {
    const { id: albumId } = await params;
    if (!albumId) return fail("BAD_REQUEST", "Missing album id", 400);

    const data = await getAlbumDetails(albumId);
    
    const enrichedData = {
      ...data,
      source: "youtube",
      songs: data.songs.map((s: any) => ({ ...s, source: "youtube" })),
    };

    return NextResponse.json({ data: enrichedData });
  } catch (error: any) {
    console.error("[Album API] error:", error);
    return fail("INTERNAL_ERROR", error.message, 500);
  }
}
