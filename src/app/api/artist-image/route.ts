import { NextResponse } from "next/server";
import { searchYouTube } from "@apis/youtubei.js";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const artist = url.searchParams.get("artist");
  if (!artist) return NextResponse.json({ error: "Missing artist" }, { status: 400 });

  try {
    const searchRes = await searchYouTube(artist);
    if (searchRes.artists && searchRes.artists.length > 0) {
      return NextResponse.json({ imageUrl: searchRes.artists[0].thumbnailUrl });
    }
    return NextResponse.json({ imageUrl: null });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
