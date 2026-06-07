import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const trackName = searchParams.get("trackName");
  const artistName = searchParams.get("artistName");

  if (!trackName || !artistName) {
    return NextResponse.json({ error: "Missing trackName or artistName" }, { status: 400 });
  }

  try {
    const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(trackName)}&artist_name=${encodeURIComponent(artistName)}`;
    
    const response = await fetch(url, {
      headers: {
        "User-Agent": "AuraMusic/1.0.0 (https://github.com/A7medWageh)"
      }
    });

    if (!response.ok) {
      // If not found, lrclib returns 404
      if (response.status === 404) {
        // Fallback: search for trackName only if first fetch failed
        const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(trackName + " " + artistName)}`;
        const searchResponse = await fetch(searchUrl, {
          headers: {
            "User-Agent": "AuraMusic/1.0.0 (https://github.com/A7medWageh)"
          }
        });

        if (searchResponse.ok) {
          const results = await searchResponse.json();
          if (results && results.length > 0 && results[0].syncedLyrics) {
            return NextResponse.json(results[0]);
          }
        }

        return NextResponse.json({ error: "Lyrics not found" }, { status: 404 });
      }
      throw new Error(`LRCLIB returned ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error("[LRCLIB] Error fetching lyrics:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
