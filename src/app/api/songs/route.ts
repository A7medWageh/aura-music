import { NextRequest, NextResponse } from "next/server";
import { searchYouTube } from "@apis/youtubei.js";

let songsCache: { data: any[]; ts: number } | null = null;
const SONGS_TTL = 15 * 60 * 1000; // 15 min

export async function GET(req: NextRequest) {
  if (songsCache && Date.now() - songsCache.ts < SONGS_TTL) {
    return NextResponse.json(
      { success: true, data: songsCache.data },
      { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } }
    );
  }

  try {
    // Fetch popular Arabic songs
    const searchRes = await searchYouTube("اغاني عربية 2026");
    const songs = searchRes.songs || [];

    const enriched = songs.map((song: any) => ({
      songId: song.songId,
      title: song.title,
      artist: song.artist || "فنان غير معروف",
      artistId: null, // Scraped songs don't have artistId easily, but player handles it
      thumbnailUrl: song.thumbnailUrl,
      youtubeVideoId: song.youtubeVideoId,
      albumId: null,
      duration: "", // Optional
      source: "youtube",
    }));

    songsCache = { data: enriched, ts: Date.now() };

    return NextResponse.json(
      { success: true, data: enriched },
      { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } }
    );
  } catch (error: any) {
    console.error("[Songs API] error:", error.message);

    if (songsCache) {
      return NextResponse.json({ success: true, data: songsCache.data, stale: true });
    }

    return NextResponse.json(
      { success: false, error: "Failed to fetch songs", details: error.message },
      { status: 500 }
    );
  }
}
