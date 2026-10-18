import { NextRequest, NextResponse } from "next/server";
import { getArtistDetails } from "@apis/youtubei.js";

const cache = new Map<string, { data: any; at: number }>();
const TTL = 30 * 60 * 1000; // 30 min



export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {


  const { id } = await params;

  const cached = cache.get(id);
  if (cached && Date.now() - cached.at < TTL) {
    return NextResponse.json(cached.data, {
      headers: { "Cache-Control": "public, s-maxage=1800" },
    });
  }

  try {
    const data = await getArtistDetails(id);
    
    // Add source tag so the frontend knows it's from YT
    const enrichedData = {
      ...data,
      source: (data as any).source || "youtube",
      songs: ((data as any).songs || []).map((s: any) => ({ ...s, source: "youtube" })),
    };

    // ONLY cache if it's not an error response
    if (enrichedData.source !== "error" && enrichedData.artistName !== "Unknown Artist") {
      cache.set(id, { data: enrichedData, at: Date.now() });
      return NextResponse.json(enrichedData, {
        headers: { "Cache-Control": "public, s-maxage=1800, stale-while-revalidate=86400" },
      });
    }
    
    return NextResponse.json(enrichedData);
  } catch (e: any) {
    console.error(`[ArtistAPI] Error for ${id}:`, e);
    return NextResponse.json(
      { error: "Failed to fetch artist details", details: e.message || "Unknown error" },
      { status: 500 }
    );
  }
}
