import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") || "";
  const artist = searchParams.get("artist") || "";
  const videoId = searchParams.get("videoId");

  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  try {
    // 1. Search Albumaty
    let songPageUrl: string | null = null;
    let queries: string[] = [];

    const cleanedTitle = title.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
    
    if (cleanedTitle && artist) queries.push(`${cleanedTitle} ${artist}`.trim());
    if (cleanedTitle) queries.push(cleanedTitle);
    
    if (cleanedTitle.includes('-')) {
      const parts = cleanedTitle.split('-').map(p => p.trim());
      queries.push(...parts);
    }
    
    const words = cleanedTitle.split(' ');
    if (words.length > 2) {
      queries.push(words.slice(0, 2).join(' '));
    }

    for (const q of queries) {
      if (!q || songPageUrl) continue;
      
      const searchUrl = `https://www.albumaty.com/search.php?q=${encodeURIComponent(q)}`;
      const searchRes = await fetch(searchUrl, { cache: "no-store" });
      const searchHtml = await searchRes.text();
      const $1 = cheerio.load(searchHtml);
      
      $1('a').each((i, el) => {
        const href = $1(el).attr('href');
        if (!songPageUrl && href && href.includes('/song/')) {
          songPageUrl = href;
        }
      });
    }

    const noCacheHeaders = {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    };

    if (!songPageUrl) {
      if (videoId) {
        console.warn(`[ytdownload] Song not found on Albumaty, falling back to YouTube for videoId: ${videoId}`);
        return NextResponse.json({ url: `/api/audio/${videoId}` }, { headers: noCacheHeaders });
      }
      return NextResponse.json({ error: "Song not found on Albumaty" }, { status: 404, headers: noCacheHeaders });
    }

    // 2. Fetch the song page
    const songRes = await fetch(songPageUrl, { cache: "no-store" });
    const songHtml = await songRes.text();
    const $2 = cheerio.load(songHtml);

    // 3. Extract MP3 link
    // First check meta property og:audio, then audio source, then audio src
    const mp3Link = $2('meta[property="og:audio"]').attr('content') || $2('audio source').attr('src') || $2('audio').attr('src');

    if (!mp3Link) {
      if (videoId) {
        console.warn(`[ytdownload] MP3 link not found on song page, falling back to YouTube for videoId: ${videoId}`);
        return NextResponse.json({ url: `/api/audio/${videoId}` }, { headers: noCacheHeaders });
      }
      return NextResponse.json({ error: "MP3 link not found on song page" }, { status: 404, headers: noCacheHeaders });
    }

    // Return the direct Albumaty MP3 URL
    return NextResponse.json({ url: mp3Link }, { headers: noCacheHeaders });
  } catch (error: any) {
    const noCacheHeaders = {
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
    };
    const { searchParams } = new URL(req.url);
    const videoId = searchParams.get("videoId");
    if (videoId) {
      console.warn(`[ytdownload] Error occurred, falling back to YouTube for videoId: ${videoId} - ${error.message}`);
      return NextResponse.json({ url: `/api/audio/${videoId}` }, { headers: noCacheHeaders });
    }
    return NextResponse.json(
      { error: "Failed to fetch from Albumaty", details: error.message },
      { status: 500, headers: noCacheHeaders }
    );
  }
}
