import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title") || "";
  const artist = searchParams.get("artist") || "";

  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  try {
    // 1. Search Albumaty
    const searchQuery = `${title} ${artist}`.trim();
    const searchUrl = `https://www.albumaty.com/search.php?q=${encodeURIComponent(searchQuery)}`;
    
    const searchRes = await fetch(searchUrl, { cache: "no-store" });
    const searchHtml = await searchRes.text();
    const $1 = cheerio.load(searchHtml);
    
    // Find the first song link
    let songPageUrl = null;
    $1('a').each((i, el) => {
      const href = $1(el).attr('href');
      if (!songPageUrl && href && href.includes('/song/')) {
        songPageUrl = href;
      }
    });

    if (!songPageUrl) {
      return NextResponse.json({ error: "Song not found on Albumaty" }, { status: 404 });
    }

    // 2. Fetch the song page
    const songRes = await fetch(songPageUrl, { cache: "no-store" });
    const songHtml = await songRes.text();
    const $2 = cheerio.load(songHtml);

    // 3. Extract MP3 link
    const mp3Link = $2('audio source').attr('src') || $2('audio').attr('src');

    if (!mp3Link) {
      return NextResponse.json({ error: "MP3 link not found on song page" }, { status: 404 });
    }

    // 4. Proxy the stream to the client
    const streamRes = await fetch(mp3Link, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        // Forward range headers for seeking
        ...(req.headers.get("range") ? { "Range": req.headers.get("range")! } : {})
      },
      cache: "no-store",
    });

    if (!streamRes.ok) {
      return NextResponse.json(
        { error: `Albumaty stream returned ${streamRes.status}: ${streamRes.statusText}` },
        { status: streamRes.status }
      );
    }

    const headers = new Headers();
    streamRes.headers.forEach((value, key) => headers.set(key, value));
    headers.set("Access-Control-Allow-Origin", "*");
    headers.set("Access-Control-Expose-Headers", "Content-Length, Accept-Ranges");

    return new NextResponse(streamRes.body, {
      status: streamRes.status,
      headers,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: "Failed to fetch from Albumaty", details: error.message },
      { status: 500 }
    );
  }
}
