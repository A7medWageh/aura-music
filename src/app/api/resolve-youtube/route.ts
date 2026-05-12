import { NextResponse } from "next/server";
import { searchYouTube } from "@/../apis/youtubei.js/index";

function fuzzyMatch(needle: string, haystack: string): boolean {
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  return n.split(/\s+/).every((word) => h.includes(word));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title");
  const artist = searchParams.get("artist");

  if (!title || !artist) {
    return NextResponse.json({ success: false, error: "Missing title or artist" }, { status: 400 });
  }

  try {
    const query = `${title} ${artist}`;
    const searchRes = await searchYouTube(query);
    const results = searchRes.songs || [];
    
    if (!results || results.length === 0) {
      return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    }

    // Try to find the exact song by fuzzy matching title
    let bestMatch = results.find((s: any) => fuzzyMatch(title.split(/[-–(]/)[0].trim(), s.title ?? ""));
    
    // If not found, just use the first result
    if (!bestMatch) {
      bestMatch = results[0];
    }

    return NextResponse.json({ 
      success: true, 
      videoId: bestMatch.videoId || bestMatch.songId,
      title: bestMatch.title
    });
  } catch (error: any) {
    console.error("[Lazy Resolve] Error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
