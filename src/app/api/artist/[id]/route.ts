import { NextRequest, NextResponse } from "next/server";
import { getArtistDetails } from "@/../apis/youtubei.js";

const cache = new Map<string, { data: any; at: number }>();
const TTL = 30 * 60 * 1000; // 30 min

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  
  // Cache disabled temporarily to ensure user sees the "Mega Scroll" changes immediately
  /*
  const cached = cache.get(id);
  if (cached && Date.now() - cached.at < TTL) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "public, s-maxage=1800" }
    });
  }
  */

  try {
    console.log(`[ArtistAPI] Fetching full discography for ${id}...`);
    const data = await getArtistDetails(id);
    // cache.set(id, { data, at: Date.now() });
    return NextResponse.json(data);
  } catch (e: any) {
    console.error(`Artist API Error for ${id}:`, e);
    return NextResponse.json(
      { error: "Failed to fetch artist details", details: e.message || "Unknown error" },
      { status: 500 }
    );
  }
}
