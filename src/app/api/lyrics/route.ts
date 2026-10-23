import { NextRequest, NextResponse } from "next/server";
import { getLyricsYoutube, getSyncedLyricsYoutube } from "@apis/youtubei.js";
import { query } from "@apis/neon";

export const dynamic = "force-dynamic";

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || "06927991ffmshcbe63a93c7bc4a5p1cc0a0jsn330d37766afa";
const RAPIDAPI_HOST = "genius-song-lyrics1.p.rapidapi.com";

/* ────────────────────────── text helpers ────────────────────────── */

function normalizeText(text: string): string {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .replace(/[َ-ْٓ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/[ىی]/g, "ي")
    .replace(/[\u0643]\u0645/g, "كم")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Strip junk that appears in song titles across sources. */
function cleanTrackName(raw: string): string {
  return (raw || "")
    .replace(/\|.*$/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\[.*?\]/g, "")
    .replace(/(official|music|video|audio|lyric|lyrics|visualizer|remastered|hd|4k|mq)/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Letters that exist only in Persian/Pashto/Urdu orthography — their presence in
// volume means the lyrics page is NOT the Arabic original (Genius serves
// translation pages that interleave the foreign text with the original lines).
const PERSIAN_ONLY = /[گچپژۈۉێەۍ۽۾]/g;

function foreignScriptRatio(text: string): number {
  if (!text) return 0;
  const letters = text.match(/\p{L}/gu);
  if (!letters || letters.length < 20) return 0;
  const hits = text.match(PERSIAN_ONLY);
  return (hits ? hits.length : 0) / letters.length;
}

/** Remove translated/foreign lines, keeping the original Arabic/Latin verses. */
function stripForeignLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => foreignScriptRatio(line) < 0.08)
    .join("\n")
    .trim();
}

function tokenOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  const ta = new Set(a.split(" ").filter(Boolean));
  const tb = new Set(b.split(" ").filter(Boolean));
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  const smaller = Math.min(ta.size, tb.size) || 1;
  return shared / smaller;
}

/**
 * Names cross scripts constantly (حمزة نمرة <-> Hamza Namira), so only reject a
 * candidate when both names are in the same script family and share nothing.
 */
function namesConflict(requested: string, found: string): boolean {
  const a = normalizeText(requested);
  const b = normalizeText(found);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return false;
  const aArabic = /[\u0600-\u06FF]/.test(a);
  const bArabic = /[\u0600-\u06FF]/.test(b);
  if (aArabic !== bArabic) return false; // transliteration — can't compare safely
  return tokenOverlap(a, b) === 0;
}

function cleanGeniusLyrics(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/^[\s\S]*?Lyrics\s*/i, "")
    .replace(/\[.*?\]/g, "")
    .replace(/\d*Embed\s*$/i, "")
    .replace(/^\d+\s*Contributors?\s*$/gim, "")
    .replace(/^(Translations?|Romanization|تفسير|ترجمة)\s*$/gim, "")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .join("\n");
}

/* ────────────────────────── server-side lyrics cache ────────────────────────── */

let tableReady = false;
async function ensureLyricsTable(): Promise<boolean> {
  if (tableReady) return true;
  try {
    await query(
      `CREATE TABLE IF NOT EXISTS lyrics_cache (
         key TEXT PRIMARY KEY,
         video_id TEXT,
         track_norm TEXT,
         artist_norm TEXT,
         plain_lyrics TEXT,
         synced_lyrics TEXT,
         source TEXT,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`
    );
    await query(`CREATE INDEX IF NOT EXISTS lyrics_cache_video_idx ON lyrics_cache (video_id)`);
    tableReady = true;
    return true;
  } catch {
    return false;
  }
}

function cacheKeys(videoId: string, track: string, artist: string): string[] {
  const keys: string[] = [];
  if (videoId) keys.push(`vid:${videoId}`);
  if (track) keys.push(`tk:${normalizeText(track)}|${normalizeText(artist)}`);
  return keys;
}

interface CacheRow {
  key: string;
  video_id: string | null;
  plain_lyrics: string | null;
  synced_lyrics: string | null;
  source: string | null;
  updated_at: string;
}

async function readLyricsCache(keys: string[], videoId: string): Promise<CacheRow | null> {
  if (keys.length === 0 || !(await ensureLyricsTable())) return null;
  try {
    const res = await query<CacheRow>(
      `SELECT key, video_id, plain_lyrics, synced_lyrics, source, updated_at
         FROM lyrics_cache
        WHERE key = ANY($1)
        ORDER BY (video_id = $2) DESC, updated_at DESC
        LIMIT 1`,
      [keys, videoId || ""]
    );
    const row = res.rows[0];
    if (!row) return null;
    // Negative results expire so a song that later gets lyrics isn't stuck empty.
    if (row.source === "none") {
      const age = Date.now() - new Date(row.updated_at).getTime();
      if (age > 3 * 24 * 3600 * 1000) return null;
    }
    return row;
  } catch {
    return null;
  }
}

async function writeLyricsCache(
  keys: string[],
  videoId: string,
  track: string,
  artist: string,
  payload: { lyrics?: string | null; syncedLyrics?: string | null; source: string }
): Promise<void> {
  if (keys.length === 0 || !(await ensureLyricsTable())) return;
  for (const key of keys) {
    try {
      await query(
        `INSERT INTO lyrics_cache (key, video_id, track_norm, artist_norm, plain_lyrics, synced_lyrics, source, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7, now())
         ON CONFLICT (key) DO UPDATE
           SET plain_lyrics = EXCLUDED.plain_lyrics,
               synced_lyrics = EXCLUDED.synced_lyrics,
               source = EXCLUDED.source,
               video_id = COALESCE(EXCLUDED.video_id, lyrics_cache.video_id),
               updated_at = now()`,
        [
          key,
          videoId || null,
          normalizeText(track),
          normalizeText(artist),
          payload.lyrics || null,
          payload.syncedLyrics || null,
          payload.source,
        ]
      );
    } catch {
      /* cache write must never fail the request */
    }
  }
}

/* ────────────────────────── sources ────────────────────────── */

/** Genius translation/annotation pages are never what the user wants. */
function isJunkGeniusHit(title: string): boolean {
  const t = (title || "").toLowerCase();
  return /translated|traduction|traducción|ترجمه|ترجمة|lyric interpretation|annotation/.test(t);
}

interface GeniusHit {
  id: number;
  title: string;
  artist: string;
}

async function geniusCandidates(searchQuery: string, artistName: string): Promise<GeniusHit[]> {
  try {
    const res = await fetch(`https://${RAPIDAPI_HOST}/search/?q=${encodeURIComponent(searchQuery)}`, {
      headers: { "x-rapidapi-host": RAPIDAPI_HOST, "x-rapidapi-key": RAPIDAPI_KEY },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const hits: any[] = data?.hits || data?.response?.hits || [];
    return hits
      .map((h) => h.result || h)
      .filter(Boolean)
      .map((r) => ({
        id: r.id,
        title: r.title || r.name || "",
        artist: r?.primaryArtist?.name || r?.artist?.name || "",
      }))
      .filter((r) => !isJunkGeniusHit(r.title))
      .filter((r) => !namesConflict(artistName, r.artist))
      .slice(0, 3);
  } catch {
    return [];
  }
}

async function geniusLyrics(songId: number): Promise<string> {
  const res = await fetch(`https://${RAPIDAPI_HOST}/song/lyrics/?id=${songId}`, {
    headers: { "x-rapidapi-host": RAPIDAPI_HOST, "x-rapidapi-key": RAPIDAPI_KEY },
  });
  if (!res.ok) return "";
  const d = await res.json();
  const bodyObj = d?.lyrics?.lyrics?.body || d?.lyrics?.body || d?.body;
  let raw = "";
  if (bodyObj?.plain && typeof bodyObj.plain === "string") raw = bodyObj.plain;
  else if (bodyObj?.html && typeof bodyObj.html === "string") {
    raw = bodyObj.html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ");
  } else if (typeof d?.lyrics === "string") raw = d.lyrics;
  return cleanGeniusLyrics(raw);
}

/** lrclib entries carry duration — pick the one matching this recording. */
interface LrclibHit {
  songName?: string;
  artistName?: string;
  duration?: number;
  syncedLyrics?: string;
  plainLyrics?: string;
}

function pickLrclib(results: LrclibHit[], durationSec: number, artistName: string): LrclibHit | null {
  const pool = results.filter((r) => r.plainLyrics || r.syncedLyrics);
  if (pool.length === 0) return null;
  const compatible = pool.filter((r) => !namesConflict(artistName, r.artistName || ""));
  const list = compatible.length ? compatible : pool;
  if (durationSec > 30) {
    const close = list
      .map((r) => ({ r, diff: Math.abs((r.duration || 0) - durationSec) }))
      .filter((x) => x.diff <= 12)
      .sort((a, b) => a.diff - b.diff);
    if (close.length) return close[0].r;
  }
  return list.find((r) => r.syncedLyrics) || list[0];
}

/**
 * Optional lyrics archive: TELEGRAM_BOT_TOKEN posts a silent copy of every newly
 * fetched lyric sheet to TELEGRAM_LYRICS_CHANNEL_ID. Neon stays the fast lookup;
 * the channel is the human-readable backup library.
 */
async function archiveToLyricsChannel(track: string, artist: string, body: string, source: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const channel = process.env.TELEGRAM_LYRICS_CHANNEL_ID;
  if (!token || !channel || !body) return;
  const text = `🎵 ${track}${artist ? ` — ${artist}` : ""}\n📚 ${source}\n\n${body}`.slice(0, 3900);
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: channel, text, disable_notification: true }),
    });
  } catch {
    /* archiving never blocks lyrics delivery */
  }
}

function cachedResponse(row: CacheRow) {  return NextResponse.json(
    {
      lyrics: row.plain_lyrics || undefined,
      syncedLyrics: row.synced_lyrics || undefined,
      source: row.source,
      cached: true,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

/* ────────────────────────── handler ────────────────────────── */

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const trackName = searchParams.get("trackName");
  const artistName = searchParams.get("artistName");
  const videoIdParam = searchParams.get("videoId") || "";
  const durationSec = parseInt(searchParams.get("duration") || "0", 10) || 0;
  const refresh = searchParams.get("refresh") === "true";

  const videoId = /^[a-zA-Z0-9_-]{11}$/.test(videoIdParam) ? videoIdParam : "";
  const cleanTrack = cleanTrackName(trackName || "");

  if (!cleanTrack && !videoId) {
    return NextResponse.json({ error: "Missing trackName or videoId" }, { status: 400 });
  }

  const keys = cacheKeys(videoId, cleanTrack, artistName || "");
  const searchQuery = `${cleanTrack} ${artistName || ""}`.trim();

  if (!refresh) {
    const row = await readLyricsCache(keys, videoId);
    if (row) {
      if (row.source === "none") {
        return NextResponse.json({ error: "Lyrics not found" }, { status: 404 });
      }
      return cachedResponse(row);
    }
  }

  const fail = async () => {
    await writeLyricsCache(keys, videoId, cleanTrack, artistName || "", { source: "none" });
    return NextResponse.json({ error: "Lyrics not found" }, { status: 404 });
  };

  const succeed = async (payload: { lyrics?: string | null; syncedLyrics?: string | null; source: string }) => {
    await writeLyricsCache(keys, videoId, cleanTrack, artistName || "", payload);
    void archiveToLyricsChannel(cleanTrack, artistName || "", payload.lyrics || payload.syncedLyrics || "", payload.source);
    return NextResponse.json(
      {
        lyrics: payload.lyrics || undefined,
        syncedLyrics: payload.syncedLyrics || undefined,
        source: payload.source,
        cached: false,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  };

  try {
    // 1. YouTube timed captions — word-accurate for official videos
    if (videoId) {
      const ytSynced = await getSyncedLyricsYoutube(videoId).catch(() => null);
      if (ytSynced?.syncedLyrics) {
        const plain = ytSynced.plainLyrics || "";
        const merged = `${plain}\n${ytSynced.syncedLyrics}`;
        if (foreignScriptRatio(merged) < 0.06) {
          return await succeed({
            lyrics: plain || ytSynced.syncedLyrics.split(/\n/).map((l) => l.replace(/^\[[^\]]*\]/, "").trim()).filter(Boolean).join("\n"),
            syncedLyrics: ytSynced.syncedLyrics,
            source: ytSynced.source || "youtube-timedtext",
          });
        }
      }
    }

    // 2. LRCLIB exact lookup (timecoded LRC)
    if (cleanTrack && artistName) {
      const lrclibRes = await fetch(
        `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTrack)}&artist_name=${encodeURIComponent(artistName)}`,
        { headers: { "User-Agent": "AuraMusic/1.0.0 (https://github.com/A7medWageh)" } }
      ).catch(() => null);

      if (lrclibRes?.ok) {
        const data: LrclibHit = await lrclibRes.json();
        if (data?.syncedLyrics && !namesConflict(artistName, data.artistName || "") && foreignScriptRatio(data.syncedLyrics) < 0.06) {
          return await succeed({ lyrics: data.plainLyrics || null, syncedLyrics: data.syncedLyrics, source: "lrclib" });
        }
      }

      // 3. LRCLIB search, disambiguated by runtime
      const searchRes = await fetch(
        `https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`,
        { headers: { "User-Agent": "AuraMusic/1.0.0 (https://github.com/A7medWageh)" } }
      ).catch(() => null);

      if (searchRes?.ok) {
        const results: LrclibHit[] = await searchRes.json();
        const best = pickLrclib(Array.isArray(results) ? results : [], durationSec, artistName);
        if (best?.syncedLyrics && foreignScriptRatio(best.syncedLyrics) < 0.06) {
          return await succeed({ lyrics: best.plainLyrics || null, syncedLyrics: best.syncedLyrics, source: "lrclib" });
        }
        if (best?.plainLyrics && foreignScriptRatio(best.plainLyrics) < 0.06) {
          return await succeed({ lyrics: best.plainLyrics, syncedLyrics: null, source: "lrclib" });
        }
      }
    }

    // 4. YouTube Music native lyrics block
    if (videoId) {
      const ytLyrics = await getLyricsYoutube(videoId).catch(() => null);
      if (ytLyrics && ytLyrics.length >= 20 && foreignScriptRatio(ytLyrics) < 0.06) {
        return await succeed({ lyrics: ytLyrics, syncedLyrics: null, source: "youtubei" });
      }
    }

    // 5. Genius via RapidAPI — artist-verified, translation pages rejected
    const candidates = await geniusCandidates(searchQuery, artistName || "");
    for (const cand of candidates) {
      const lyrics = await geniusLyrics(cand.id).catch(() => "");
      if (lyrics.length < 30) continue;
      const ratio = foreignScriptRatio(lyrics);
      if (ratio >= 0.06) {
        const cleaned = stripForeignLines(lyrics);
        if (cleaned.length < 30 || foreignScriptRatio(cleaned) >= 0.06) continue;
        return await succeed({ lyrics: cleaned, syncedLyrics: null, source: "rapidapi-genius" });
      }
      return await succeed({ lyrics, syncedLyrics: null, source: "rapidapi-genius" });
    }

    // 6. Gemini last resort (never for songs that may be copyrighted elsewhere)
    if (process.env.GEMINI_API_KEY) {
      try {
        const { GoogleGenAI } = require("@google/genai");
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: `Write the original lyrics for the song "${cleanTrack}" by the artist "${artistName}".
CRITICAL INSTRUCTIONS:
1. Return ONLY the pure lyrics, in the exact language the song is sung in.
2. NO intro, NO outro, NO explanations, NO translation of any kind.
3. DO NOT use markdown formatting.
4. If you do not have the exact, real, verified lyrics for this specific song in your training data, YOU MUST RETURN THE EXACT WORD "NOT_FOUND".`,
        });
        let aiLyrics = (response.text?.trim() || "").replace(/```[a-z]*\n?/g, "").replace(/```/g, "").trim();
        if (aiLyrics && !aiLyrics.includes("NOT_FOUND") && aiLyrics.length > 20 && foreignScriptRatio(aiLyrics) < 0.06) {
          return await succeed({ lyrics: aiLyrics, syncedLyrics: null, source: "ai" });
        }
      } catch {
        /* ignore */
      }
    }

    return await fail();
  } catch (err: any) {
    console.error("[Lyrics] Error:", err?.message);
    return NextResponse.json({ error: err?.message || "lyrics_error" }, { status: 500 });
  }
}
