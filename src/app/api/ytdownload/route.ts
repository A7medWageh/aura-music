import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") || "";
  const artist = searchParams.get("artist") || "";
  const qStr = searchParams.get("q") || "";
  const videoId = searchParams.get("videoId");

  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  try {
    // 1. Search Albumaty
    let songPageUrl: string | null = null;
    let queries: string[] = [];

    // Prioritize the user's explicit original search query if available (e.g. Arabic query)
    if (qStr) {
      const q = qStr.trim();
      queries.push(q);
      const parts = q.split(' ');
      if (parts.length > 2) {
        // user might have typed "Song Name Artist Name" -> try first 2 words
        queries.push(parts.slice(0, 2).join(' '));
        // try first 3 words
        queries.push(parts.slice(0, 3).join(' '));
      }
    }

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
        // Fallback to fetch native YouTube title to retry on Albumaty
        try {
          const { getYTWeb } = await import('@apis/youtubei.js/index');
          const yt = await getYTWeb();
          const info = await yt.music.getInfo(videoId);
          const ytTitle = info?.basic_info?.title;
          if (ytTitle && ytTitle !== title && ytTitle !== q) {
             const searchUrl = `https://www.albumaty.com/search.php?q=${encodeURIComponent(ytTitle)}`;
             const searchRes = await fetch(searchUrl, { cache: "no-store" });
             const searchHtml = await searchRes.text();
             const $yt = cheerio.load(searchHtml);
             $yt('a').each((i, el) => {
               const href = $yt(el).attr('href');
               if (!songPageUrl && href && href.includes('/song/')) {
                 songPageUrl = href;
               }
             });
          }
        } catch (e) {
          console.warn("[ytdownload] yt fallback failed", e);
        }
        
        if (!songPageUrl) {
          console.warn(`[ytdownload] Song not found on Albumaty, falling back to YouTube for videoId: ${videoId}`);
          return NextResponse.json({ url: `/api/audio/${videoId}`, debugQueries: queries }, { headers: noCacheHeaders });
        }
      } else {
        return NextResponse.json({ error: "Song not found on Albumaty", debugQueries: queries }, { status: 404, headers: noCacheHeaders });
      }
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
        return NextResponse.json({ url: `/api/audio/${videoId}`, debugNoMp3: songPageUrl }, { headers: noCacheHeaders });
      }
      return NextResponse.json({ error: "Could not find valid audio source on Albumaty", debugNoMp3: songPageUrl }, { status: 404, headers: noCacheHeaders });
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
