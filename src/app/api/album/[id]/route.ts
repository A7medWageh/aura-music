import { NextRequest, NextResponse } from "next/server";
import { getAlbumDetails } from "@apis/youtubei.js";
import { checkRateLimit } from "@/services/security/rateLimit";
import { fail } from "@/services/http/response";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const rate = await checkRateLimit(req, { key: "album_api", max: 100, windowSec: 60 });
  if (!rate.allowed) return fail("RATE_LIMITED", "Too many requests", 429);

  try {
    const albumId = params.id;
    if (!albumId) return fail("BAD_REQUEST", "Missing album id", 400);

    const data = await getAlbumDetails(albumId);
    return NextResponse.json({ data });
  } catch (error: any) {
    console.error("Album API error:", error);
    return fail("INTERNAL_ERROR", error.message, 500);
  }
}
