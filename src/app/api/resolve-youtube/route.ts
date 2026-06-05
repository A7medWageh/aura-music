import { NextResponse } from "next/server";
import { searchYouTube } from "@/../apis/youtubei.js/index";
import { scrapeArabicSong } from "@/../apis/scraping/arabicScraper";

// In-memory cache to avoid re-searching the same song
const resolveCache = new Map<string, { videoId?: string; streamUrl?: string; isDirectMp3?: boolean; title: string; ts: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

function normalize(s: string): string {
  return s.toLowerCase()
    .replace(/[^\u0600-\u06FFa-z0-9\s]/g, "") // keep Arabic + Latin + numbers
    .replace(/\s+/g, " ").trim();
}

function scoreMatch(result: any, title: string, artist: string): number {
  const rTitle = normalize(result.title ?? "");
  const rArtist = normalize(result.artist ?? result.artistName ?? "");
  const nTitle = normalize(title);
  const nArtist = normalize(artist);

  let score = 0;

  // Title match (most important)
  const titleWords = nTitle.split(/\s+/).filter(w => w.length > 1);
  const titleMatchCount = titleWords.filter(w => rTitle.includes(w)).length;
  score += (titleMatchCount / Math.max(titleWords.length, 1)) * 60;

  // Artist match (important)
  if (nArtist && rArtist) {
    const artistWords = nArtist.split(/\s+/).filter(w => w.length > 1);
    const artistMatchCount = artistWords.filter(w => rArtist.includes(w)).length;
    score += (artistMatchCount / Math.max(artistWords.length, 1)) * 30;
  }

  // Penalize if result title is too different in length (likely wrong song)
  const lenRatio = Math.min(rTitle.length, nTitle.length) / Math.max(rTitle.length, nTitle.length, 1);
  score += lenRatio * 10;

  return score;
}

import { checkTunnelRedirect } from "@/utils/tunnelProxy";

export async function GET(req: Request) {
  const redirect = await checkTunnelRedirect(req);
  if (redirect) return redirect;

  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title")?.trim();
  const artist = searchParams.get("artist")?.trim() ?? "";

  if (!title) {
    return NextResponse.json({ success: false, error: "Missing title" }, { status: 400 });
  }

  const cacheKey = `${title}__${artist}`.toLowerCase();

  // Return cached result instantly
  const cached = resolveCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    if (cached.streamUrl) {
      return NextResponse.json({ success: true, streamUrl: cached.streamUrl, title: cached.title, isDirectMp3: cached.isDirectMp3, fromCache: true });
    }
    return NextResponse.json({ success: true, videoId: cached.videoId, title: cached.title, fromCache: true });
  }

  try {
    // 1. Try Arabic Scraper first (fastest, most accurate for Arabic songs)
    const arabicResult = await scrapeArabicSong(title, artist);
    if (arabicResult && arabicResult.url) {
      resolveCache.set(cacheKey, { streamUrl: arabicResult.url, isDirectMp3: true, title: arabicResult.title, ts: Date.now() });
      return NextResponse.json({
        success: true,
        streamUrl: arabicResult.url,
        isDirectMp3: true,
        title: arabicResult.title
      });
    }

    // 2. Fallback to YouTube
    const query = artist
      ? `${title} ${artist} official audio`
      : `${title} official audio`;

    const searchRes = await searchYouTube(query);
    const results: any[] = searchRes?.songs ?? [];

    if (!results.length) {
      return NextResponse.json({ success: false, error: "No results found" }, { status: 404 });
    }

    // Score all results and pick the best match
    const scored = results
      .map(r => ({ ...r, _score: scoreMatch(r, title, artist) }))
      .sort((a, b) => b._score - a._score);

    const best = scored[0];
    const videoId = best.videoId ?? best.songId;

    if (!videoId) {
      return NextResponse.json({ success: false, error: "No videoId in result" }, { status: 404 });
    }

    // Cache result
    resolveCache.set(cacheKey, { videoId, title: best.title, ts: Date.now() });

    return NextResponse.json({
      success: true,
      videoId,
      title: best.title,
      score: best._score,
    });
  } catch (error: any) {
    console.error("[Lazy Resolve] Error:", error.message);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

