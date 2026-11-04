import { NextRequest, NextResponse } from "next/server";
import { getLyricsYoutube, getSyncedLyricsYoutube } from "@apis/youtubei.js";
import { query } from "@apis/neon";
import { ARABIC_TO_LATIN_MAP, BILINGUAL_ARTIST_MAP } from "@/services/music/artistMatcher";

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

// Scripts an Arabic/Latin lyric sheet can never be written in. LRCLIB's search
// happily returns, say, a Nepali song titled "Hawa" for an Arabic "Hawa", so a
// language gate has to exist even when the request carries a Latin title.
const NON_ARABIC_SCRIPTS =
  /[\u0370-\u03FF\u0400-\u04FF\u0590-\u05FF\u0900-\u0DFF\u0E00-\u0E7F\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/g;

function foreignScriptRatio(text: string): number {
  if (!text) return 0;
  const letters = text.match(/\p{L}/gu);
  if (!letters || letters.length < 20) return 0;
  const persian = text.match(PERSIAN_ONLY);
  const other = text.match(NON_ARABIC_SCRIPTS);
  return ((persian ? persian.length : 0) + (other ? other.length : 0)) / letters.length;
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

// A provider that refuses us (quota/rate limit) must not be recorded as
// "this song has no lyrics", so callers track that distinction per request.
const isTransientError = (status: number) => status === 429 || status === 502 || status === 503;


/** Genius translation/annotation pages are never what the user wants. */
function isJunkGeniusHit(title: string): boolean {
  const t = (title || "").toLowerCase();
  return /translated|translation|traduction|traducción|übersetzung|romanized|romanization|transliteration|ترجمه|ترجمة|lyric interpretation|annotation/.test(t);
}

interface GeniusHit {
  id: number;
  title: string;
  artist: string;
  url?: string;
}

const GENIUS_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
// Genius' CDN answers datacenter IPs (Vercel) with a 403 challenge; a full
// browser header set is tried before giving up on the source.
const GENIUS_HEADERS: Record<string, string> = {
  "User-Agent": GENIUS_UA,
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9,ar;q=0.8",
  "Sec-Fetch-Dest": "empty",
  "Sec-Fetch-Mode": "cors",
  "Sec-Fetch-Site": "same-origin",
  Origin: "https://genius.com",
  Referer: "https://genius.com/",
};

/** Genius' own search API — free, and unlike RapidAPI it returns the credited artist. */
async function geniusWebCandidates(
  searchQuery: string,
  artistName: string,
  trackName: string,
  state: { blocked: boolean },
  trace?: string[]
): Promise<GeniusHit[]> {
  try {
    const res = await fetch(`https://genius.com/api/search/multi?q=${encodeURIComponent(searchQuery)}`, {
      headers: GENIUS_HEADERS,
    });
    if (!res.ok) {
      trace?.push(`genius_web_search_http_${res.status}`);
      // A 403 from Genius' CDN means they refuse us, not that the song is missing.
      if (res.status === 403 || isTransientError(res.status)) state.blocked = true;
      return [];
    }
    const data = await res.json();
    const sections: any[] = data?.response?.sections || [];
    const seen = new Set<number>();
    const hits: GeniusHit[] = [];
    for (const section of sections) {
      for (const entry of section?.hits || []) {
        const r = entry?.result;
        if (!r || r._type !== "song" || !r.url || !r.id || seen.has(r.id)) continue;
        seen.add(r.id);
        hits.push({ id: r.id, title: r.title || "", artist: r?.primary_artist?.name || "", url: r.url });
      }
    }
    trace?.push(`genius_web_hits=${hits.length}`);
    return hits
      .filter((r) => !isJunkGeniusHit(r.title))
      .map((r) => ({ r, score: geniusHitScore(r, trackName, artistName) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => x.r);
  } catch {
    return [];
  }
}

function geniusLyricsHtml(page: string): string {
  const blocks: string[] = [];
  const openRe = /<div[^>]*data-lyrics-container="true"[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = openRe.exec(page))) {
    const from = match.index + match[0].length;
    const scan = /<div\b|<\/div>/gi;
    scan.lastIndex = from;
    let depth = 1;
    let end = -1;
    let tag: RegExpExecArray | null;
    while ((tag = scan.exec(page))) {
      depth += tag[0].toLowerCase().startsWith("<div") ? 1 : -1;
      if (depth === 0) {
        end = tag.index;
        break;
      }
    }
    if (end === -1) break;
    blocks.push(page.slice(from, end));
    openRe.lastIndex = end;
  }
  return blocks.join("\n");
}

function htmlToLyricText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/\u00a0|\u205f|\u2060/g, " ")
    .replace(/[\u200b-\u200f]/g, "");
}

async function geniusWebLyrics(
  url: string,
  state: { blocked: boolean },
  trace?: string[]
): Promise<{ cleaned: string; raw: string }> {
  const res = await fetch(url, {
    headers: { ...GENIUS_HEADERS, Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" },
  });
  if (!res.ok) {
    trace?.push(`genius_web_page_http_${res.status}`);
    if (res.status === 403 || isTransientError(res.status)) state.blocked = true;
    return { cleaned: "", raw: "" };
  }
  const page = await res.text();
  const raw = htmlToLyricText(geniusLyricsHtml(page));
  return { cleaned: cleanGeniusLyrics(raw), raw };
}

async function geniusCandidates(
  searchQuery: string,
  artistName: string,
  trackName: string,
  state: { blocked: boolean },
  trace?: string[]
): Promise<GeniusHit[]> {
  try {
    let res = await fetch(`https://${RAPIDAPI_HOST}/search/?q=${encodeURIComponent(searchQuery)}`, {
      headers: { "x-rapidapi-host": RAPIDAPI_HOST, "x-rapidapi-key": RAPIDAPI_KEY },
    });
    if (!res.ok && isTransientError(res.status)) {
      await new Promise((r) => setTimeout(r, 1200));
      res = await fetch(`https://${RAPIDAPI_HOST}/search/?q=${encodeURIComponent(searchQuery)}`, {
        headers: { "x-rapidapi-host": RAPIDAPI_HOST, "x-rapidapi-key": RAPIDAPI_KEY },
      });
    }
    if (!res.ok) {
      trace?.push(`genius_search_http_${res.status}`);
      if (isTransientError(res.status)) state.blocked = true;
      return [];
    }
    const data = await res.json();
    const hits: any[] = data?.hits || data?.response?.hits || [];
    trace?.push(`genius_hits=${hits.length}`);
    return hits
      .map((h) => h.result || h)
      .filter(Boolean)
      .map((r) => ({
        id: r.id,
        title: r.title || r.name || "",
        artist: r?.primaryArtist?.name || r?.artist?.name || "",
      }))
      .filter((r) => !isJunkGeniusHit(r.title))
      .map((r) => ({ r, score: geniusHitScore(r, trackName, artistName) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => x.r);
  } catch {
    return [];
  }
}

async function geniusLyrics(songId: number, state: { blocked: boolean }, trace?: string[]): Promise<{ cleaned: string; raw: string }> {
  const res = await fetch(`https://${RAPIDAPI_HOST}/song/lyrics/?id=${songId}`, {
    headers: { "x-rapidapi-host": RAPIDAPI_HOST, "x-rapidapi-key": RAPIDAPI_KEY },
  });
  if (!res.ok) {
    trace?.push(`genius_lyrics_${songId}_http_${res.status}`);
    if (isTransientError(res.status)) state.blocked = true;
    return { cleaned: "", raw: "" };
  }
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
  return { cleaned: cleanGeniusLyrics(raw), raw };
}

/**
 * Genius section headers ("[المقطع الأول: سعد لمجرد و إليسا]", "[Verse 1: …]")
 * name the real performer, which the search API doesn't return. That is the only
 * reliable way to tell the right song from a same-title/unrelated hit.
 */
function geniusBodyArtists(raw: string, hitTitle: string, hitArtist: string): string[] {
  const names = new Set<string>();
  // Genius credits bilingual artists as "Hamza Namira - حمزة نمرة"; each half is
  // a usable identity on its own.
  for (const part of (hitArtist || "").split(/\s*[-–&+,]\s*|\s+ft\.?\s+|\s*\(\s*\)/i)) {
    const t = part.trim();
    if (t.length > 1) names.add(t);
  }
  const prefix = /^([^-–]{2,50})[-–]\s/.exec(hitTitle || "");
  if (prefix) names.add(prefix[1]);
  for (const m of (raw || "").matchAll(/\[([^\]\n]{0,70}):([^\]\n]{0,70})\]/g)) {
    for (const part of m[2].split(/,|،|&|\/|\s+و\s*| ft\.?\s+|\s+\+\s+/i)) {
      const t = part.replace(/<[^>]+>/g, "").trim();
      if (t.length > 1 && t.length < 45 && !/^\d/.test(t)) names.add(t);
    }
  }
  return [...names];
}

/**
 * Genius lookup: search → identity gate → page download → body verification.
 * Returns null when nothing on Genius can be proven to be this song.
 */
async function geniusStage(opts: {
  searchQuery: string;
  artistName: string;
  cleanTrack: string;
  upstream: { blocked: boolean };
  wantsArabic: boolean;
  trace: string[];
  debug: boolean;
}): Promise<{ lyrics: string; source: string } | null> {
  const { searchQuery, artistName, cleanTrack, upstream, trace, debug } = opts;  let useWeb = true;
  let candidates = await geniusWebCandidates(searchQuery, artistName, cleanTrack, upstream, debug ? trace : undefined);
  if (candidates.length === 0) {
    useWeb = false;
    candidates = await geniusCandidates(searchQuery, artistName, cleanTrack, upstream, debug ? trace : undefined);
  }
  for (const cand of candidates) {
    // Cheap gate first: the search result already names the artist, so a page
    // only gets downloaded when the metadata could plausibly be this song.
    const metaArtists = geniusBodyArtists("", cand.title, cand.artist);
    const metaArtistSim = artistName
      ? Math.max(0, ...metaArtists.map((a) => nameSimilarity(artistName, a)))
      : 0;
    const metaTitleSim = nameSimilarity(cleanTrack, cand.title.replace(/^[^-]*[-–]\s*/, ""));
    if (metaArtistSim < 0.25 && metaTitleSim < 0.6) {
      trace?.push(`genius_meta_reject_${cand.id} "${cand.title.slice(0, 30)}" aSim=${metaArtistSim.toFixed(2)} tSim=${metaTitleSim.toFixed(2)}`);
      continue;
    }

    const { cleaned, raw } = await (useWeb && cand.url
      ? geniusWebLyrics(cand.url, upstream, debug ? trace : undefined)
      : geniusLyrics(cand.id, upstream, debug ? trace : undefined)
    ).catch(() => ({ cleaned: "", raw: "" }));
    if (cleaned.length < 30) continue;

    const bodyArtists = geniusBodyArtists(raw, cand.title, cand.artist);
    const artistSim = artistName ? Math.max(0, ...bodyArtists.map((a) => nameSimilarity(artistName, a))) : 0;
    const titleSim = nameSimilarity(cleanTrack, cand.title.replace(/^[^-]*[-–]\s*/, ""));
    if (debug) trace.push(`genius_${cand.id} "${cand.title.slice(0, 40)}" aSim=${artistSim.toFixed(2)} tSim=${titleSim.toFixed(2)} ar=${arabicShare(cleaned).toFixed(2)}`);
    // A page only counts as this song when the credited singer appears in it,
    // or its own title is unmistakably the requested track.
    if (artistSim < 0.25 && titleSim < 0.6) continue;

    if (foreignScriptRatio(cleaned) >= 0.06) {
      const stripped = stripForeignLines(cleaned);
      if (stripped.length < 30 || !usableLyrics(stripped, opts.wantsArabic)) continue;
      return { lyrics: stripped, source: useWeb ? "genius" : "rapidapi-genius" };
    }
    if (!usableLyrics(cleaned, opts.wantsArabic)) continue;
    return { lyrics: cleaned, source: useWeb ? "genius" : "rapidapi-genius" };
  }
  return null;
}

/**
 * Genius' CDN answers Vercel's datacenter IPs with a 403 challenge. The always-on
 * worker laptop has a residential address, so production can ask it to run the
 * Genius stage on its behalf (`?provider=genius` on the same endpoint).
 */
let relayUrl: { base: string; at: number } | null = null;

async function relayWorkerUrl(): Promise<string | null> {
  if (relayUrl && Date.now() - relayUrl.at < 120000) return relayUrl.base;
  try {
    const rows = await query<{ value: string }>(
      "SELECT value FROM system_config WHERE key = 'tunnel_url' LIMIT 1"
    );
    const base = rows.rows[0]?.value?.trim();
    if (!base || !/^https?:\/\//.test(base)) return null;
    const health = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
    if (!health?.ok) return null;
    relayUrl = { base, at: Date.now() };
    return base;
  } catch {
    return null;
  }
}

async function geniusViaRelay(
  trackName: string,
  artistName: string,
  state: { blocked: boolean },
  trace?: string[]
): Promise<string | null> {
  const base = await relayWorkerUrl();
  if (!base) {
    trace?.push("genius_relay_no_worker");
    state.blocked = true; // worker offline ≠ the song has no lyrics
    return null;
  }
  const params = new URLSearchParams({ provider: "genius", trackName, artistName });
  const res = await fetch(`${base}/api/lyrics?${params.toString()}`, {
    signal: AbortSignal.timeout(15000),
  }).catch(() => null);
  if (!res) {
    trace?.push("genius_relay_timeout");
    state.blocked = true;
    return null;
  }
  if (!res.ok) {
    trace?.push(`genius_relay_http_${res.status}`);
    if (res.status === 503) state.blocked = true;
    return null;
  }
  const data = await res.json().catch(() => null);
  const lyrics = typeof data?.lyrics === "string" ? data.lyrics : "";
  trace?.push(lyrics.length > 30 ? "genius_relay_ok" : "genius_relay_empty");
  return lyrics.length > 30 ? lyrics : null;
}

/**
 * YouTube timed captions (real line timings) are refused to Vercel's datacenter
 * IPs. The always-on worker laptop fetches them with `?provider=captions` and
 * this endpoint caches the result in Neon like any other source.
 */
async function captionsViaRelay(
  videoId: string,
  trace?: string[]
): Promise<{ plainLyrics: string; syncedLyrics: string } | null> {
  const base = await relayWorkerUrl();
  if (!base) {
    trace?.push("captions_relay_no_worker");
    return null;
  }
  const params = new URLSearchParams({ provider: "captions", videoId });
  try {
    const res = await fetch(`${base}/api/lyrics?${params.toString()}`, {
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) {
      trace?.push(`captions_relay_http_${res.status}`);
      return null;
    }
    const data = await res.json().catch(() => null);
    const synced = typeof data?.syncedLyrics === "string" ? data.syncedLyrics : "";
    if (synced.length < 30) {
      trace?.push("captions_relay_empty");
      return null;
    }
    trace?.push("captions_relay_ok");
    return {
      plainLyrics: typeof data?.lyrics === "string" ? data.lyrics : "",
      syncedLyrics: synced,
    };
  } catch {
    trace?.push("captions_relay_timeout");
    return null;
  }
}

/** lrclib entries carry duration — pick the one matching this recording. */
interface LrclibHit {
  id?: number;
  trackName?: string;
  artistName?: string;
  duration?: number;
  syncedLyrics?: string;
  plainLyrics?: string;
}

const TITLE_NOISE =
  /(official\s*(music\s*)?(video|audio)?|lyric(s)?\s*video|lyrics?|visuali[sz]er|remaster(ed)?|audio|hq|hd|4k|كليب|فيديو|أغنية|حصري[ًا]?|نسخة)/gi;

function stripTitleNoise(raw: string): string {
  return (raw || "")
    .replace(/[\u{1F300}-\u{1FAFF}\u2600-\u27BF\uFE0F]/gu, " ")
    .replace(/[“”"'’]/g, "")
    .replace(/[([].*?[)\]]/g, " ")
    .replace(TITLE_NOISE, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/[|]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[-–\s]+|[-–\s]+$/g, "")
    .trim();
}

function nameVariants(raw: string, max = 6): string[] {
  const out = new Set<string>();
  const base = stripTitleNoise(raw);
  if (base.length >= 2) out.add(base);
  for (const part of (raw || "").split(/\s*[|/]\s*|\s+[-–]\s+/)) {
    const cleaned = stripTitleNoise(part);
    if (cleaned.length >= 2) out.add(cleaned);
    if (out.size >= max) break;
  }
  return [...out].slice(0, max);
}

/**
 * Streaming titles bundle singer and track in every order and script
 * ("Siilawy - Nassaba", "يا حلو - آدم | Adam - Ya Helou"). Rather than guessing
 * which half is which, every token is offered as both a track and an artist
 * candidate and the LRCLIB hit's own metadata decides.
 */
function lrclibQueryPlan(title: string, artist: string) {
  const tracks = new Set(nameVariants(title));
  const artists = new Set(nameVariants(artist));
  for (const v of nameVariants(title)) artists.add(v);
  const mapped = ARABIC_TO_LATIN_MAP[artist?.trim() || ""] || BILINGUAL_ARTIST_MAP[artist?.toLowerCase().trim() || ""];
  if (mapped) artists.add(mapped);
  for (const part of (artist || "").split(/\s*(?:&|,|،|\+|\/|\band\b|\s+و\s*|feat\.?|ft\.?)\s*/i)) {
    const cleaned = stripTitleNoise(part);
    if (cleaned.length >= 2) artists.add(cleaned);
  }

  const trackList = [...tracks].filter((t) => t.length >= 2);
  const artistList = [...artists].filter((a) => a.length >= 2);
  const queries = new Set<string>();
  for (const t of trackList.slice(0, 3)) {
    for (const a of artistList.slice(0, 3)) {
      if (t.toLowerCase() !== a.toLowerCase()) queries.add(`${t} ${a}`);
    }
    queries.add(t);
  }
  return { tracks: trackList, artists: artistList, queries: [...queries].slice(0, 8) };
}

async function searchLrclibSynced(
  title: string,
  artist: string,
  durationSec: number,
  trace?: string[]
): Promise<LrclibHit | null> {
  const plan = lrclibQueryPlan(title, artist);
  const pool = new Map<number, LrclibHit>();
  let syntheticId = 1;
  for (const q of plan.queries) {
    try {
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
        headers: { "User-Agent": "AuraMusic/1.0.0 (https://github.com/A7medWageh)" },
        signal: AbortSignal.timeout(3500),
      });
      if (!res.ok) continue;
      const hits: LrclibHit[] = await res.json().catch(() => []);
      for (const hit of Array.isArray(hits) ? hits : []) {
        if (!hit || (!hit.syncedLyrics && !hit.plainLyrics)) continue;
        const key = typeof hit.id === "number" ? hit.id : syntheticId++;
        if (!pool.has(key)) pool.set(key, hit);
      }
    } catch {}
  }
  trace?.push(`lrclib_pool=${pool.size}`);
  const scored = [...pool.values()]
    .map((hit) => {
      const titleSim = Math.max(0, ...plan.tracks.map((t) => nameSimilarity(t, hit.trackName || "")));
      const artistSim = hit.artistName
        ? Math.max(0, ...plan.artists.map((a) => nameSimilarity(a, hit.artistName || "")))
        : 0;
      const diff = durationSec > 30 && hit.duration ? Math.abs(hit.duration - durationSec) : 999;
      const durationScore = diff <= 8 ? 1 : diff <= 20 ? 0.6 : diff <= 40 ? 0.2 : 0;
      return { hit, titleSim, artistSim, diff, score: titleSim * 0.6 + artistSim * 0.25 + durationScore * 0.15 };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return null;
  trace?.push(
    `lrclib_best t=${best.titleSim.toFixed(2)} a=${best.artistSim.toFixed(2)} dur=${best.diff} "${(best.hit.trackName || "").slice(0, 30)}"`
  );
  if (best.titleSim < 0.55) return null;
  // A different title can still be the same recording, but only a matching
  // runtime makes an unrelated artist safe.
  if (durationSec > 30 && best.artistSim < 0.2 && !(best.hit.duration && best.diff <= 8)) return null;
  return best.hit;
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

/** Fold Arabic to Latin so "تملى معاك" can be compared with "Tamali M3ak". */
const AR_FOLD: Record<string, string> = {
  ا: "a", آ: "a", أ: "a", إ: "i", ء: "", ي: "y", ئ: "y", و: "w", ؤ: "u",
  ب: "b", ت: "t", ث: "s", ج: "j", ح: "h", خ: "k", د: "d", ذ: "z", ر: "r",
  ز: "z", س: "s", ش: "sh", ص: "s", ض: "d", ط: "t", ظ: "z", ع: "a", غ: "gh",
  ف: "f", ق: "k", ك: "k", ل: "l", م: "m", ن: "n", ه: "h", ة: "t", ى: "a",
};

function foldName(value: string): string {
  const norm = normalizeText(value);
  if (!norm) return "";
  let out = "";
  for (const ch of norm) {
    if (/[\u0600-\u06FF]/.test(ch)) out += AR_FOLD[ch] ?? "";
    else if (/[a-z0-9]/.test(ch)) out += ch;
  }
  const consonants = out.replace(/[^a-z0-9]/g, "").replace(/(.)\1+/g, "$1").replace(/[aeiou]/g, "");
  return consonants || out.replace(/[^a-z0-9]/g, "");
}

/** Bigram (Dice) similarity over script-folded names. */
function nameSimilarity(a: string, b: string): number {
  const fa = foldName(a);
  const fb = foldName(b);
  if (!fa || !fb) return 0;
  if (fa === fb) return 1;
  // Containment only counts when one name nearly covers the other — otherwise a
  // short title like "hotel" would match "Heartbreak Hotel".
  const [short, long] = fa.length <= fb.length ? [fa, fb] : [fb, fa];
  if (short.length >= 4 && (long.includes(short) || short.includes(long)) && short.length / long.length >= 0.5) return 1;
  const grams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ga = grams(fa);
  const gb = grams(fb);
  let shared = 0;
  for (const g of ga) if (gb.has(g)) shared++;
  return (2 * shared) / (ga.size + gb.size || 1);
}

/**
 * Genius search returns unrelated songs whose artist field is often missing, so
 * score hits on both artist and title, and demand that an Arabic request yields
 * Arabic text — otherwise the wrong song's lyrics get served with a confident
 * source label.
 */
function geniusHitScore(hit: GeniusHit, track: string, artist: string): number {
  const title = hit.title.replace(/^[^-]*[-–]\s*/, "");
  const titleSim = nameSimilarity(track, title);
  const artistSim = hit.artist ? nameSimilarity(artist, hit.artist) : 0;
  return titleSim * 0.65 + artistSim * 0.35;
}

function arabicShare(text: string): number {
  const letters = text.match(/[ء-يA-Za-z]/g);
  if (!letters || letters.length < 20) return 1; // too short to judge
  const ar = text.match(/[ء-ي]/g);
  return (ar ? ar.length : 0) / letters.length;
}

/** A lyric sheet is only usable if it is long enough and in the singer's language. */
function usableLyrics(text: string, wantsArabic: boolean): boolean {
  if (!text || text.length < 20) return false;
  if (foreignScriptRatio(text) >= 0.06) return false;
  if (wantsArabic && arabicShare(text) < 0.2) return false;
  return true;
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
  const trackName = searchParams.get("trackName") || searchParams.get("title");
  const artistName = searchParams.get("artistName") || searchParams.get("artist");
  const videoIdParam = searchParams.get("videoId") || "";
  const durationSec = parseInt(searchParams.get("duration") || "0", 10) || 0;
  const refresh = searchParams.get("refresh") === "true";
  const debug = searchParams.get("debug") === "true";
  // `provider=genius` is the worker-side relay mode: run only the Genius stage,
  // touch no cache, and answer 503 when nothing verifiable was found.
  const geniusOnly = searchParams.get("provider") === "genius";
  const trace: string[] = [];
  const upstream = { blocked: false };

  const videoId = /^[a-zA-Z0-9_-]{11}$/.test(videoIdParam) ? videoIdParam : "";
  const cleanTrack = cleanTrackName(trackName || "");
  // An Arabic-titled request must yield Arabic text, and no source may leak a
  // Persian/Urdu translation page in place of the original lyrics.
  const wantsArabic = /[ء-ي]/.test(`${cleanTrack}${artistName || ""}`);

  if (!cleanTrack && !videoId) {
    return NextResponse.json({ error: "Missing trackName or videoId" }, { status: 400 });
  }

  const keys = cacheKeys(videoId, cleanTrack, artistName || "");
  const searchQuery = `${cleanTrack} ${artistName || ""}`.trim();

  if (geniusOnly) {
    const only = await geniusStage({
      searchQuery,
      artistName: artistName || "",
      cleanTrack,
      upstream,
      wantsArabic,
      trace,
      debug,
    });
    if (!only) {
      return NextResponse.json(
        debug ? { error: "Lyrics not found", trace } : { error: "Lyrics not found" },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { lyrics: only.lyrics, source: only.source, cached: false, ...(debug ? { trace } : {}) },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  // Worker-side caption mode: fetch real line timings on the residential IP and
  // hand them back to production. Touches no cache (the caller owns it).
  if (searchParams.get("provider") === "captions") {
    if (!videoId) return NextResponse.json({ error: "videoId required" }, { status: 400 });
    const timed = await getSyncedLyricsYoutube(videoId).catch(() => null);
    if (!timed?.syncedLyrics) {
      return NextResponse.json({ error: "No timed captions" }, { status: 404 });
    }
    return NextResponse.json(
      {
        lyrics: timed.plainLyrics || undefined,
        syncedLyrics: timed.syncedLyrics,
        source: "youtube-timedtext",
        cached: false,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!refresh) {
    const row = await readLyricsCache(keys, videoId);
    if (row) {
      if (row.source === "none") {
        return NextResponse.json(
          debug ? { error: "Lyrics not found", trace: ["cache_none"] } : { error: "Lyrics not found" },
          { status: 404 }
        );
      }
      // Plain-only rows predate the caption relay: upgrade them to timed lyrics
      // so karaoke appears without the user removing the app cache.
      const stale = Date.now() - new Date(row.updated_at).getTime() > 6 * 3600 * 1000;
      if (row.plain_lyrics && !row.synced_lyrics && videoId && stale) {
        const timed = await captionsViaRelay(videoId, debug ? trace : undefined);
        if (timed) {
          await writeLyricsCache(keys, videoId, cleanTrack, artistName || "", {
            lyrics: row.plain_lyrics,
            syncedLyrics: timed.syncedLyrics,
            source: "captions-relay",
          });
          row.synced_lyrics = timed.syncedLyrics;
          row.source = "captions-relay";
        }
      }
      return cachedResponse(row);
    }
  }

  const fail = async () => {
    if (!upstream.blocked) await writeLyricsCache(keys, videoId, cleanTrack, artistName || "", { source: "none" });
    return NextResponse.json(
      debug ? { error: "Lyrics not found", trace, blocked: upstream.blocked } : { error: "Lyrics not found" },
      { status: upstream.blocked ? 503 : 404 }
    );
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
        ...(debug ? { trace } : {}),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  };

  // An Arabic-titled request must yield Arabic text, and no source may leak a
  // Persian/Urdu translation page in place of the original lyrics.
  const usable = (text: string): boolean => usableLyrics(text, wantsArabic);

  try {
    let lrclibPlain: string | null = null;

    // 1. LRCLIB exact lookup — hand-curated LRC beats auto-captions whenever it exists.
    if (cleanTrack && artistName) {
      const lrclibRes = await fetch(
        `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTrack)}&artist_name=${encodeURIComponent(artistName)}`,
        { headers: { "User-Agent": "AuraMusic/1.0.0 (https://github.com/A7medWageh)" } }
      ).catch(() => null);

      if (lrclibRes?.ok) {
        const data: LrclibHit = await lrclibRes.json();
        if (data?.syncedLyrics && !namesConflict(artistName, data.artistName || "") && usable(data.syncedLyrics)) {
          return await succeed({ lyrics: data.plainLyrics || null, syncedLyrics: data.syncedLyrics, source: "lrclib" });
        }
        if (data?.plainLyrics && usable(data.plainLyrics)) lrclibPlain = data.plainLyrics;
      }

      // 2. LRCLIB search across every title/artist spelling the uploader used
      const best = await searchLrclibSynced(cleanTrack, artistName || "", durationSec, debug ? trace : undefined);
      if (best?.syncedLyrics && usable(best.syncedLyrics)) {
        return await succeed({ lyrics: best.plainLyrics || null, syncedLyrics: best.syncedLyrics, source: "lrclib" });
      }
      if (!lrclibPlain && best?.plainLyrics && usable(best.plainLyrics)) {
        lrclibPlain = best.plainLyrics;
      }
    }

    // 3. YouTube timed captions — line-level karaoke for songs LRCLIB has never seen.
    if (videoId) {
      const ytSynced = await getSyncedLyricsYoutube(videoId).catch(() => null);
      if (ytSynced?.syncedLyrics) {
        const plain = ytSynced.plainLyrics || "";
        const merged = `${plain}\n${ytSynced.syncedLyrics}`;
        if (usable(merged)) {
          return await succeed({
            lyrics: plain || ytSynced.syncedLyrics.split(/\n/).map((l) => l.replace(/^\[[^\]]*\]/, "").trim()).filter(Boolean).join("\n"),
            syncedLyrics: ytSynced.syncedLyrics,
            source: ytSynced.source || "youtube-timedtext",
          });
        }
      }
    }

    // 4. The same captions fetched by the residential worker — Vercel IPs are blocked.
    if (videoId) {
      const timed = await captionsViaRelay(videoId, debug ? trace : undefined);
      if (timed && usable(timed.syncedLyrics)) {
        return await succeed({
          lyrics: timed.plainLyrics || null,
          syncedLyrics: timed.syncedLyrics,
          source: "captions-relay",
        });
      }
    }

    // 5. Plain lyrics from LRCLIB, shown when no timed source exists at all.
    if (lrclibPlain) {
      return await succeed({ lyrics: lrclibPlain, syncedLyrics: null, source: "lrclib" });
    }

    // 6. YouTube Music native lyrics block
    if (videoId) {
      const ytLyrics = await getLyricsYoutube(videoId).catch(() => null);
      if (usable(ytLyrics || "")) {
        return await succeed({ lyrics: ytLyrics, syncedLyrics: null, source: "youtubei" });
      }
    }

    // 7. Genius — page identity verified against the requested artist.
    // Genius' own (key-free) API is primary; RapidAPI is quota-capped and only
    // covers the case where Genius blocks us.
    const direct = await geniusStage({ searchQuery, artistName: artistName || "", cleanTrack, upstream, wantsArabic, trace, debug });
    if (direct) {
      return await succeed({ lyrics: direct.lyrics, syncedLyrics: null, source: direct.source });
    }

    // Vercel's egress IPs get a 403 from Genius — let the worker laptop fetch it.
    if (!geniusOnly) {
      const relayed = await geniusViaRelay(cleanTrack, artistName || "", upstream, debug ? trace : undefined);
      if (relayed) {
        return await succeed({ lyrics: relayed, syncedLyrics: null, source: "genius-relay" });
      }
    }

    // 9. Gemini last resort (never for songs that may be copyrighted elsewhere)
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
