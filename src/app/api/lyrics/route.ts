import { NextRequest, NextResponse } from "next/server";
import { Client } from "genius-lyrics";

export const dynamic = "force-dynamic";

const genius = new Client();

/**
 * Clean raw Genius lyrics text:
 * - Remove the "X ContributorsTranslations... Lyrics" header Genius prepends
 * - Remove section tags like [Verse 1], [Chorus], [Bridge], etc.
 * - Remove trailing "Embed" or ad text Genius appends
 * - Collapse multiple blank lines into one
 */
function cleanGeniusLyrics(raw: string): string {
  return raw
    // Remove everything up to and including the first "Lyrics" keyword (Genius header)
    .replace(/^[\s\S]*?Lyrics\s*/i, "")
    // Remove section tags [Verse 1], [Chorus], [Bridge], [Intro], [Outro], [Pre-Chorus], etc.
    .replace(/\[.*?\]/g, "")
    // Remove Genius "Embed" button text that sometimes appears at the end
    .replace(/\d*Embed\s*$/i, "")
    // Remove common non-lyric lines added by contributors (e.g. "X Contributors", "Romanization")
    .replace(/^\d+\s*Contributors?\s*$/gim, "")
    .replace(/^(Translations?|Romanization|تفسير|ترجمة)\s*$/gim, "")
    // Split into lines, trim each, filter blanks
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .join("\n");
}

import { getLyricsYoutube } from "@apis/youtubei.js";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const trackName  = searchParams.get("trackName");
  const artistName = searchParams.get("artistName");
  const videoId = searchParams.get("videoId");

  if (!trackName || !artistName) {
    return NextResponse.json({ error: "Missing trackName or artistName" }, { status: 400 });
  }

  try {
    // ── 1. LRCLIB (preferred — has synced timestamps) ──────────────────────────
    const lrclibUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(trackName)}&artist_name=${encodeURIComponent(artistName)}`;
    const lrclibRes = await fetch(lrclibUrl, {
      headers: { "User-Agent": "AuraMusic/1.0.0 (https://github.com/A7medWageh)" },
    });

    if (lrclibRes.ok) {
      const data = await lrclibRes.json();
      if (data.syncedLyrics) return NextResponse.json(data);
      // Has plain lyrics but no sync — still usable, save for fallback comparison
    }

    if (lrclibRes.status === 404 || lrclibRes.ok) {
      // Try LRCLIB search as a second attempt
      const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(`${trackName} ${artistName}`)}`;
      const searchRes = await fetch(searchUrl, {
        headers: { "User-Agent": "AuraMusic/1.0.0 (https://github.com/A7medWageh)" },
      });
      if (searchRes.ok) {
        const results = await searchRes.json();
        const synced = results?.find?.((r: any) => r.syncedLyrics);
        if (synced) return NextResponse.json(synced);
      }
    }

    // ── 2. youtubei.js (YouTube Music native lyrics) ──────────────────────────
    if (videoId) {
      console.log(`[Lyrics] Trying youtubei.js for: ${videoId}`);
      const ytLyrics = await getLyricsYoutube(videoId);
      if (ytLyrics) {
        return NextResponse.json({ plainLyrics: ytLyrics, source: "youtubei" });
      }
    }

    // ── 3. Genius fallback — plain text only but very wide coverage ────────────
    console.log(`[Lyrics] Falling back to Genius for: ${trackName} – ${artistName}`);
    const geniusResults = await genius.songs.search(`${trackName} ${artistName}`);

    if (geniusResults && geniusResults.length > 0) {
      const rawLyrics  = await geniusResults[0].lyrics();
      const plainLyrics = cleanGeniusLyrics(rawLyrics);

      if (plainLyrics.length > 0) {
        return NextResponse.json({ plainLyrics, source: "genius" });
      }
    }

    return NextResponse.json({ error: "Lyrics not found" }, { status: 404 });
  } catch (err: any) {
    console.error("[Lyrics] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
