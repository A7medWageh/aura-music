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

  // Clean track name for better search results
  const cleanTrackName = trackName
    .replace(/\|.*$/g, '') // Remove anything after |
    .replace(/\(.*?\)/g, '') // Remove anything in parentheses
    .replace(/\[.*?\]/g, '') // Remove anything in brackets
    .replace(/(official|music|video|audio|lyric|lyrics|remix|hd|4k)/ig, '')
    .split('-').map(s => s.trim()).pop() || trackName; // Try to get the actual song name if it's "Artist - Song"
  
  const finalTrackName = cleanTrackName.trim() || trackName.trim();

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

    // ── 3. Optional: Translate Franco-Arabic title to Arabic to improve Genius/AI hits ──
    let searchTrackName = finalTrackName;
    if (process.env.GEMINI_API_KEY && /^[a-zA-Z0-9\s_.-]+$/.test(finalTrackName)) {
      try {
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const translatePrompt = `The song title is "${finalTrackName}" by artist "${artistName}".
If the title is written in Franco-Arabic (Arabic written with English letters/numbers), transliterate it exactly to Arabic script.
If it is a pure English song, return it exactly as is.
Return ONLY the title text, nothing else. No quotes, no explanations.`;
        
        const response = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: translatePrompt,
        });
        
        const translated = response.text?.trim().replace(/['"]/g, '') || "";
        if (translated && !translated.includes("\n") && translated.length < 100) {
          searchTrackName = translated;
          console.log(`[Lyrics] Translated title for search: "${finalTrackName}" -> "${searchTrackName}"`);
        }
      } catch (e) {
        console.warn("[Lyrics] Title translation failed, continuing with original title.");
      }
    }

    // ── 4. Genius fallback — plain text only but very wide coverage ────────────
    console.log(`[Lyrics] Falling back to Genius for: ${searchTrackName} – ${artistName}`);
    const geniusResults = await genius.songs.search(`${searchTrackName} ${artistName}`);

    if (geniusResults && geniusResults.length > 0) {
      const rawLyrics  = await geniusResults[0].lyrics();
      const plainLyrics = cleanGeniusLyrics(rawLyrics);

      if (plainLyrics.length > 0) {
        return NextResponse.json({ plainLyrics, source: "genius" });
      }
    }

    // ── 5. AI Generation Fallback (Gemini) ────────────
    if (process.env.GEMINI_API_KEY) {
      console.log(`[Lyrics] Falling back to AI (Gemini) for: ${searchTrackName} – ${artistName}`);
      try {
        const { GoogleGenAI } = require('@google/genai');
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const prompt = `Write the original lyrics for the song "${searchTrackName}" by the artist "${artistName}".
CRITICAL INSTRUCTIONS:
1. Return ONLY the pure lyrics.
2. NO intro, NO outro, NO explanations.
3. DO NOT use markdown formatting or code blocks (\`\`\`).
4. DO NOT include headers like [Verse] or [Chorus] unless necessary.
5. EXTREMELY IMPORTANT: If you do not have the exact, real, verified lyrics for this specific song in your training data, YOU MUST RETURN THE EXACT WORD "NOT_FOUND". Do not guess, do not translate the title, and do not make up fake lyrics. It is strictly forbidden to hallucinate lyrics.`;
        
        let aiLyrics = "";
        try {
          const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
          });
          aiLyrics = response.text?.trim() || "";
        } catch (e: any) {
          if (e.status === 429) {
             console.warn("[Lyrics] Gemini AI Quota Exceeded (Rate Limit). Skipping AI lyrics for now.");
          } else if (e.status === 503) {
            console.log("[Lyrics] gemini-2.5-flash unavailable (503), retrying in 2 seconds...");
            await new Promise(r => setTimeout(r, 2000));
            const response = await ai.models.generateContent({
              model: 'gemini-2.5-flash',
              contents: prompt,
            });
            aiLyrics = response.text?.trim() || "";
          } else {
            throw e;
          }
        }
        
        aiLyrics = aiLyrics.replace(/```[a-z]*\n?/g, "").replace(/```/g, "").trim();
        
        if (aiLyrics && !aiLyrics.includes("NOT_FOUND") && aiLyrics.length > 20) {
           return NextResponse.json({ plainLyrics: aiLyrics, source: "ai" });
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
