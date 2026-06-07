import { NextRequest, NextResponse } from "next/server";
import { Client } from "genius-lyrics";

export const dynamic = "force-dynamic";

const genius = new Client();

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const trackName = searchParams.get("trackName");
  const artistName = searchParams.get("artistName");

  if (!trackName || !artistName) {
    return NextResponse.json({ error: "Missing trackName or artistName" }, { status: 400 });
  }

  try {
    // 1. Try LRCLIB for REAL synced lyrics first
    const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(trackName)}&artist_name=${encodeURIComponent(artistName)}`;
    const response = await fetch(url, { headers: { "User-Agent": "AuraMusic/1.0.0 (https://github.com/A7medWageh)" } });

    if (response.ok) {
      const data = await response.json();
      if (data.syncedLyrics) {
        return NextResponse.json(data);
      }
    } else if (response.status === 404) {
      // 2. Try LRCLIB Search
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(trackName + " " + artistName)}`;
      const searchResponse = await fetch(searchUrl, { headers: { "User-Agent": "AuraMusic/1.0.0 (https://github.com/A7medWageh)" } });
      if (searchResponse.ok) {
        const results = await searchResponse.json();
        if (results && results.length > 0 && results[0].syncedLyrics) {
          return NextResponse.json(results[0]);
        }
      }
    }

    // 3. Fallback to Genius if LRCLIB fails or has no synced lyrics
    console.log(`[Lyrics] Falling back to Genius for: ${trackName} ${artistName}`);
    const searches = await genius.songs.search(`${trackName} ${artistName}`);
    if (searches && searches.length > 0) {
      const firstSong = searches[0];
      const rawLyrics = await firstSong.lyrics();
      
      // Clean Genius tags: remove metadata before "Lyrics", remove [Chorus] tags, remove empty lines
      const cleanLines = rawLyrics
        .replace(/^.*Lyrics\s*/i, "")
        .replace(/\[.*?\]/g, "")
        .split("\n")
        .map(l => l.trim())
        .filter(l => l.length > 0);
        
      const plainLyrics = cleanLines.join("\n");
      return NextResponse.json({ plainLyrics, source: "genius" });
    }

    return NextResponse.json({ error: "Lyrics not found anywhere" }, { status: 404 });
  } catch (err: any) {
    console.error("[Lyrics] Error fetching lyrics:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
