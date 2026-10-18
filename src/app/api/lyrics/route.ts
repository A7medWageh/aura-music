import { NextRequest, NextResponse } from "next/server";
import { getLyricsYoutube, getSyncedLyricsYoutube } from "@apis/youtubei.js";

export const dynamic = "force-dynamic";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "06927991ffmshcbe63a93c7bc4a5p1cc0a0jsn330d37766afa";
const RAPIDAPI_HOST = "genius-song-lyrics1.p.rapidapi.com";

function cleanGeniusLyrics(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/^[\s\S]*?Lyrics\s*/i, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\d*Embed\s*$/i, "")
    .replace(/^\d+\s*Contributors?\s*$/gim, "")
    .replace(/^(Translations?|Romanization|تفسير|ترجمة)\s*$/gim, "")
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join("\n");
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const trackName  = searchParams.get("trackName");
  const artistName = searchParams.get("artistName");
  const videoId = searchParams.get("videoId");

  if (!trackName && !videoId) {
    return NextResponse.json({ error: "Missing trackName or videoId" }, { status: 400 });
  }

  const cleanTrackName = (trackName || "")
    .replace(/\|.*$/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/(official|music|video|audio|lyric|lyrics|remix|hd|4k)/ig, '')
    .trim();

  const searchQuery = `${cleanTrackName} ${artistName || ""}`.trim();
  console.log(`[Lyrics] Searching lyrics for: "${searchQuery}" (videoId="${videoId || ""}")`);

  try {
    // 1. YouTube Timed Captions (100% accurate second-by-second synced lyrics for official videos)
    if (videoId && /^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
      console.log(`[Lyrics] Checking YouTube timed captions for: ${videoId}`);
      const ytSynced = await getSyncedLyricsYoutube(videoId).catch(() => null);
      if (ytSynced && ytSynced.syncedLyrics) {
        console.log(`[Lyrics] Found synced lyrics via YouTube TimedText!`);
        return NextResponse.json({ 
          lyrics: ytSynced.plainLyrics, 
          syncedLyrics: ytSynced.syncedLyrics,
          source: ytSynced.source || "youtube-timedtext" 
        });
      }
    }

    // 2. Try LRCLIB for perfectly synced line-by-line lyrics (LRC format)
    if (cleanTrackName && artistName) {
      const lrclibUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTrackName)}&artist_name=${encodeURIComponent(artistName)}`;
      const lrclibRes = await fetch(lrclibUrl, {
        headers: { "User-Agent": "AuraMusic/1.0.0 (https://github.com/A7medWageh)" },
      });

      if (lrclibRes.ok) {
        const data = await lrclibRes.json();
        if (data.syncedLyrics) {
          console.log(`[Lyrics] Found synced lyrics via LRCLIB!`);
          return NextResponse.json({ 
            lyrics: data.plainLyrics, 
            syncedLyrics: data.syncedLyrics,
            source: "lrclib" 
          });
        }
      }

      // 3. Try LRCLIB Search as a fallback
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`;
      const searchRes = await fetch(searchUrl, {
        headers: { "User-Agent": "AuraMusic/1.0.0 (https://github.com/A7medWageh)" },
      });
      
      if (searchRes.ok) {
        const results = await searchRes.json();
        const synced = results?.find?.((r: any) => r.syncedLyrics);
        if (synced) {
          console.log(`[Lyrics] Found synced lyrics via LRCLIB Search!`);
          return NextResponse.json({ 
            lyrics: synced.plainLyrics, 
            syncedLyrics: synced.syncedLyrics,
            source: "lrclib" 
          });
        }
      }
    }

    // 4. YouTube Music native lyrics
    if (videoId) {
      console.log(`[Lyrics] Trying youtubei.js description for: ${videoId}`);
      const ytLyrics = await getLyricsYoutube(videoId).catch(() => null);
      if (ytLyrics) {
        return NextResponse.json({ lyrics: ytLyrics, source: "youtubei" });
      }
    }

    // 4. RapidAPI Genius fallback (User requested)
    console.log(`[Lyrics] YouTube failed, using RapidAPI Genius...`);
    const geniusSearchRes = await fetch(`https://${RAPIDAPI_HOST}/search/?q=${encodeURIComponent(searchQuery)}`, {
      headers: {
        'x-rapidapi-host': RAPIDAPI_HOST,
        'x-rapidapi-key': RAPIDAPI_KEY
      }
    });
    
    if (geniusSearchRes.ok) {
      const searchData = await geniusSearchRes.json();
      const hits = searchData?.hits || searchData?.response?.hits || [];
      
      if (hits.length > 0) {
        const songId = hits[0].result.id;
        console.log(`[Lyrics] Found Genius ID: ${songId}`);

        const lyricsRes = await fetch(`https://${RAPIDAPI_HOST}/song/lyrics/?id=${songId}`, {
          headers: {
            'x-rapidapi-host': RAPIDAPI_HOST,
            'x-rapidapi-key': RAPIDAPI_KEY
          }
        });

        if (lyricsRes.ok) {
          const lyricsData = await lyricsRes.json();
          let rawLyrics = "";
          const bodyObj = lyricsData?.lyrics?.lyrics?.body || lyricsData?.lyrics?.body || lyricsData?.body;

          if (bodyObj?.plain && typeof bodyObj.plain === "string") {
            rawLyrics = bodyObj.plain;
          } else if (bodyObj?.html && typeof bodyObj.html === "string") {
            rawLyrics = bodyObj.html
              .replace(/<br\s*\/?>/gi, "\n")
              .replace(/<\/p>/gi, "\n\n")
              .replace(/<[^>]+>/g, "")
              .replace(/&amp;/g, "&")
              .replace(/&lt;/g, "<")
              .replace(/&gt;/g, ">")
              .replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'")
              .replace(/&nbsp;/g, " ");
          } else if (typeof lyricsData?.lyrics === "string") {
            rawLyrics = lyricsData.lyrics;
          }

          const finalLyrics = cleanGeniusLyrics(rawLyrics);
          if (finalLyrics.length >= 10) {
            return NextResponse.json({ lyrics: finalLyrics, plainLyrics: finalLyrics, source: "rapidapi-genius" });
          }
        }
      }
    }

    // 3. Fallback to Gemini AI if everything else fails
    if (process.env.GEMINI_API_KEY) {
      console.log(`[Lyrics] Falling back to AI (Gemini) for: ${cleanTrackName} – ${artistName}`);
      try {
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const prompt = `Write the original lyrics for the song "${cleanTrackName}" by the artist "${artistName}".
CRITICAL INSTRUCTIONS:
1. Return ONLY the pure lyrics.
2. NO intro, NO outro, NO explanations.
3. DO NOT use markdown formatting.
4. If you do not have the exact, real, verified lyrics for this specific song in your training data, YOU MUST RETURN THE EXACT WORD "NOT_FOUND".`;
        
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        });
        
        let aiLyrics = response.text?.trim() || "";
        aiLyrics = aiLyrics.replace(/```[a-z]*\n?/g, "").replace(/```/g, "").trim();
        
        if (aiLyrics && !aiLyrics.includes("NOT_FOUND") && aiLyrics.length > 20) {
           return NextResponse.json({ lyrics: aiLyrics, source: "ai" });
        }
      } catch (err: any) {
        console.error("[Lyrics] AI Generation failed:", err.message);
      }
    }

    return NextResponse.json({ error: "Lyrics not found" }, { status: 404 });
  } catch (err: any) {
    console.error("[Lyrics] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
