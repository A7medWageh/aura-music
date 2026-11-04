import { Innertube, UniversalCache, Platform } from "youtubei.js";
import * as dns from "node:dns";

// Fix for ENOTFOUND errors in environments where IPv6 is flaky
dns.setDefaultResultOrder("ipv4first");

// Fix for Next.js stripping vm module which breaks youtubei.js deciphering
Platform.shim.eval = async (data: any) => {
  return new Function(data.output)();
};

import * as path from "path";
import { getRedisClient } from "../redis";
import { resolveAlbumatyStream } from "../../src/services/scrapers/albumaty";
import { resolveSoundCloudStream } from "../../src/services/scrapers/soundcloud";
import { resolveSaavnStream } from "../../src/services/scrapers/saavn";

const YT_DLP_PATH = process.env.YT_DLP_PATH || path.join(process.cwd(), "yt-dlp-master", "yt-dlp.cmd");

// ── Singleton instances ───────────────────────────────────────────────────────
let ytWeb: Innertube | null = null;
let ytInitPromise: Promise<Innertube> | null = null;

export async function getYTWeb(): Promise<Innertube> {
  if (ytWeb) return ytWeb;
  if (!ytInitPromise) {
    ytInitPromise = Innertube.create({
      cache: new UniversalCache(false),
      generate_session_locally: true,
      location: "EG",
      client_type: "WEB" as any,
    }).then((instance) => {
      ytWeb = instance;
      return instance;
    });
  }
  return ytInitPromise;
}

// Eagerly warm the session on module load (fire and forget)
getYTWeb().catch(() => {});

// ── In-memory caches ──────────────────────────────────────────────────────────
const searchCache = new Map<string, { data: any; expiresAt: number }>();
const SEARCH_TTL = 5 * 60 * 1000; // 5 min
const albumCache = new Map<string, { data: any; expiresAt: number }>();
const artistCache = new Map<string, { data: any; expiresAt: number }>();
const ARTIST_TTL = 30 * 60 * 1000; // 30 min

export function sanitizeTitle(title: string) {
  return title
    .replace(/\(Official.*?\)/gi, "")
    .replace(/\[Official.*?\]/gi, "")
    .replace(/\(Lyric.*?\)/gi, "")
    .replace(/\[Lyric.*?\]/gi, "")
    .replace(/\(Audio.*?\)/gi, "")
    .replace(/\[Audio.*?\]/gi, "")
    .replace(/\|\s*(?:Official|Audio|Video|Lyrics?|Music Video|كليب|فيديو|أغنية).*$/gi, "")
    .replace(/FT\..*/gi, "")
    .replace(/FEAT\..*/gi, "")
    .trim();
}

export function getHighResThumbnail(thumbnails: any[]) {
  if (!thumbnails || thumbnails.length === 0) return null;
  const bestUrl = thumbnails[thumbnails.length - 1].url;

  if (bestUrl.includes("googleusercontent.com") || bestUrl.includes("ggpht.com")) {
    if (bestUrl.includes("=")) {
      return bestUrl.replace(/=[^/]+$/, "=s1080");
    }
    return `${bestUrl}=s1080`;
  } else if (bestUrl.includes("i.ytimg.com")) {
    return bestUrl.replace(/\/(?:hq)?default\.jpg/, "/maxresdefault.jpg");
  }
  return bestUrl;
}

// ── Helper to safely extract songs from any YouTube Music search response ────
function extractSongs(results: any): any[] {
  const raw =
    results?.songs?.contents ??
    results?.tracks?.contents ??
    results?.contents ??
    [];
  return (Array.isArray(raw) ? raw : [])
    .map((v: any) => ({
      type: "song",
      songId: v.id ?? v.videoId,
      title: sanitizeTitle(v.title?.toString() || ""),
      artist:
        v.artists?.[0]?.name ??
        v.author?.name ??
        v.subtitle?.toString() ??
        "فنان غير معروف",
      youtubeVideoId: v.id ?? v.videoId,
      duration: toSeconds(v.duration?.asSeconds?.() ?? v.duration?.seconds ?? v.duration ?? v.length),
      thumbnailUrl: getHighResThumbnail(v.thumbnails),
    }))
    .filter((v: any) => v.songId && v.title);
}

function extractAlbums(results: any): any[] {
  const raw = results?.albums?.contents ?? [];
  return (Array.isArray(raw) ? raw : []).map((p: any) => ({
    type: "album",
    albumId: p.id,
    title: sanitizeTitle(p.title?.toString() || ""),
    artist: p.author?.name ?? p.artists?.[0]?.name ?? "فنان غير معروف",
    thumbnailUrl: getHighResThumbnail(p.thumbnails),
  }));
}

function extractArtists(results: any, artistResults: any): any[] {
  const raw =
    results?.artists?.contents?.length
      ? results.artists.contents
      : artistResults?.artists?.contents ?? [];
  const map = new Map<string, any>();
  (Array.isArray(raw) ? raw : []).forEach((c: any) => {
    if (c.id && !map.has(c.id)) {
      map.set(c.id, {
        type: "artist",
        artistId: c.id,
        artistName: c.name?.toString() ?? "فنان غير معروف",
        thumbnailUrl: getHighResThumbnail(c.thumbnails),
      });
    }
  });
  return Array.from(map.values());
}

// ── Junk/noise filter — keeps kids content, vlogs & non-music videos out of results ──
const JUNK_PATTERN = /(أ?غاني?\s*أ?طفال|كرتون|انمي|anime|kids|nursery|cocomelon|baby\s*(shark|bus|yin)?|طيور\s*الجنة|عصافير|كاريوكي|karaoke|بودكاست|podcast|vlog|فلوج|تحدي|challenge|بريك|مقاطع\s*قصيرة|shorts|جيم|قيمنق|gaming|playstation|فوفوزيلا)/i;

export function isJunkResult(...texts: (string | undefined | null)[]): boolean {
  return JUNK_PATTERN.test(texts.filter(Boolean).join(" "));
}

/** Parse "3:45" / "1:02:45" / 210 (seconds) / { seconds: 210 } into seconds; 0 when unknown. */
function toSeconds(d: any): number {
  if (typeof d === "number") return d;
  if (typeof d?.seconds === "number") return d.seconds;
  if (typeof d?.asSeconds === "function") return d.asSeconds();
  const s = String(d?.timestamp ?? d ?? "").replace(/[^0-9:]/g, "");
  if (!s) return 0;
  const parts = s.split(":").map(Number);
  return parts.length >= 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] || 0;
}

/** A "song-shaped" regular YouTube video: 40s–12min, no junk keywords. */
function looksLikeSongVideo(v: any): boolean {
  const dur = typeof v.seconds === "number" ? v.seconds : toSeconds(v.duration ?? v.durationString ?? v.lengthSeconds);
  if (dur && (dur < 40 || dur > 12 * 60)) return false;
  return !isJunkResult(v.title, v.author?.name ?? v.channel?.name);
}

function tokenizeSimple(s: string): string[] {
  return String(s || "").toLowerCase().split(/[\s|,_\-–—]+/).filter(Boolean);
}

// ── getMusicCharts ────────────────────────────────────────────────────────────
export async function getMusicCharts() {
  const innertube = await getYTWeb();
  try {
    const results = await innertube.music.search("أغاني تريند مصر", { type: "song" });
    const songs = extractSongs(results).slice(0, 30);
    if (songs.length > 0) return songs;
  } catch (e) {
    console.warn("[Charts] search failed, trying Piped API");
  }

  // ── Ultimate Fallback: Piped API (Bypasses IP Blocks) ──
  const pipedChartsInstances = ["https://cf.piped.video", "https://api.piped.private.coffee"];
  for (const inst of pipedChartsInstances) {
    try {
      const res = await fetch(`${inst}/trending?region=EG`, {
        cache: "no-store",
        headers: { "Accept": "application/json" },
        signal: AbortSignal.timeout(2500),
      });
      if (!res.ok) continue;
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        return data.slice(0, 30).map((v: any) => ({
          songId: v.url.replace("/watch?v=", ""),
          youtubeVideoId: v.url.replace("/watch?v=", ""),
          title: sanitizeTitle(v.title || ""),
          artist: v.uploaderName || "فنان غير معروف",
          thumbnailUrl: v.thumbnail || ""
        }));
      }
    } catch (e) {
      // try next instance
    }
  }

  return [];
}

// ── getNewReleases ────────────────────────────────────────────────────────────
export async function getNewReleases() {
  const innertube = await getYTWeb();
  const results = await innertube.music.search("احدث الاغاني المصرية 2026 حصريا", { type: "song" });
  return extractSongs(results).slice(0, 50);
}

export async function searchYouTubeInnertube(query: string) {
  const innertube = await getYTWeb();

  const [generalResults, songResults, artistResults, albumResults] = await Promise.all([
    innertube.music.search(query).catch(() => null),
    innertube.music.search(query, { type: "song" }).catch(() => null),
    innertube.music.search(query, { type: "artist" }).catch(() => null),
    innertube.music.search(query, { type: "album" }).catch(() => null),
  ]);

  const songMap = new Map<string, any>();

  [...extractSongs(generalResults), ...extractSongs(songResults ?? {})].forEach(
    (s) => { if (s.songId && !songMap.has(s.songId)) songMap.set(s.songId, s); }
  );

  const albumMap = new Map<string, any>();
  [...extractAlbums(generalResults), ...extractAlbums(albumResults ?? {})].forEach(
    (a) => { if (a.albumId && !albumMap.has(a.albumId)) albumMap.set(a.albumId, a); }
  );

  const artists = extractArtists(generalResults, artistResults).slice(0, 5);

  // Prolific artists list far more albums on their discography page than in
  // search — pull it in when the query is essentially the artist's name.
  // Name comparison fails across scripts (محمد منير vs "Mohamed Mounir"), so a
  // short query also merges whatever YouTube's own artist search ranked first.
  const topArtist = artists[0];
  const norm = (s: string) => (s || "").replace(/\s+/g, " ").trim().toLowerCase();
  const an = norm(topArtist?.artistName?.replace(/\s*-\s*Topic\s*$/i, ""));
  const qn = norm(query);
  const nameMatch = an && (qn.includes(an) || an.includes(qn));
  const looksLikeArtistQuery = tokenizeSimple(query).length <= 3 && !!topArtist?.artistId;
  if (albumMap.size < 200 && (nameMatch || looksLikeArtistQuery)) {
    const disc: any = await withTimeout(
      getArtistDetailsYoutube(topArtist.artistId).catch(() => null),
      25000,
      null
    );
    if (disc) {
      [...(disc.newReleases || []), ...(disc.oldAlbums || [])].forEach((a: any) => {
        if (a.albumId && !albumMap.has(a.albumId)) {
          albumMap.set(a.albumId, {
            type: "album",
            albumId: a.albumId,
            title: a.title,
            artist: a.artist || disc.artistName || topArtist.artistName,
            thumbnailUrl: a.thumbnailUrl || topArtist.thumbnailUrl,
            year: a.year || 0,
          });
        }
      });
    }
  }

  // Wrong-song guard lives in the audio resolver (artist gate on cached rows),
  // NOT here: swapping ids to official album-track versions would orphan every
  // Telegram-cached row (keys are the clicked upload ids) and break playback.

  const songs = Array.from(songMap.values()).filter((s: any) => !isJunkResult(s.title, s.artist)).slice(0, 30);
  const albums = Array.from(albumMap.values()).slice(0, 200);

  const result = { query, songs, albums, artists };
  if (songs.length === 0 && albums.length === 0 && artists.length === 0) {
    throw new Error("No search results from YouTube API");
  }
  return result;
}

// ── Secondary sources: yt-search, then plain (non-music) Innertube search ──
async function searchYouTubeFallbacks(query: string): Promise<any | null> {
  try {
    const yts = require("yt-search");
    const r = await yts(query);

    const songs = (r.videos || []).filter(looksLikeSongVideo).slice(0, 20).map((v: any) => ({
      songId: v.videoId,
      youtubeVideoId: v.videoId,
      duration: typeof v.seconds === "number" ? v.seconds : toSeconds(v.duration),
      title: sanitizeTitle(v.title),
      artist: v.author?.name || "فنان غير معروف",
      thumbnailUrl: v.thumbnail || ""
    }));

    const albums = (r.playlists || r.lists || []).slice(0, 8).map((p: any) => ({
      type: "album",
      albumId: p.listId,
      title: sanitizeTitle(p.title),
      artist: p.author?.name || "فنان غير معروف",
      thumbnailUrl: p.thumbnail || ""
    }));

    const accounts = (r.accounts || r.channels || []).slice(0, 5).map((s: any) => ({
      type: "artist",
      artistId: s.url ? s.url.split("/").pop() : s.name,
      artistName: s.name || "فنان غير معروف",
      thumbnailUrl: s.thumbnail || s.image || ""
    }));

    if (songs.length === 0 && albums.length === 0 && accounts.length === 0) return null;
    return { query, songs, albums, artists: accounts, source: "yt-search" };
  } catch (err) {
    console.warn("[Search] yt-search fallback failed, trying basic Innertube search:", err);
    try {
      const yt = await getYTWeb();
      const res = await yt.search(query, { type: "video" });
      const raw = (res as any)?.videos ?? (res as any)?.contents ?? [];
      const songs = (Array.isArray(raw) ? raw : []).map((v: any) => ({
        type: "song",
        songId: v.id ?? v.videoId,
        title: sanitizeTitle(v.title?.toString() || ""),
        artist: v.author?.name ?? v.channel?.name ?? "YouTube",
        youtubeVideoId: v.id ?? v.videoId,
        thumbnailUrl: getHighResThumbnail(v.thumbnails),
        duration: v.duration,
      })).filter((s: any) => s.songId && s.title && looksLikeSongVideo(s)).slice(0, 20);

      return { query, songs, albums: [], artists: [], source: "basic-innertube" };
    } catch (innertubeErr) {
      return null;
    }
  }
}

export async function searchYouTube(query: string) {
  const cacheKey = query.trim().toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const [primaryRes, fbRes] = await Promise.all([
    searchYouTubeInnertube(query).catch((e) => {
      console.warn(`[Search] Innertube multi-search failed for "${query}":`, e.message);
      return null;
    }),
    searchYouTubeFallbacks(query).catch((e) => {
      console.warn(`[Search] Fallback search failed for "${query}":`, e.message);
      return null;
    }),
  ]);

  const primary = primaryRes;
  const fb = fbRes;

  if (!primary && !fb) {
    return { query, songs: [], albums: [], artists: [], source: "empty" };
  }

  // Deduplicate and merge songs: fallback (comprehensive YouTube index) + primary (YouTube Music)
  const seenIds = new Set<string>();
  const mergedSongs: any[] = [];

  for (const s of [...(fb?.songs || []), ...(primary?.songs || [])]) {
    const id = String(s.songId || s.youtubeVideoId || s.videoId || "");
    if (id && !seenIds.has(id)) {
      seenIds.add(id);
      mergedSongs.push(s);
    }
  }

  const result = {
    query,
    songs: mergedSongs,
    albums: primary?.albums?.length ? primary.albums : (fb?.albums || []),
    artists: primary?.artists?.length ? primary.artists : (fb?.artists || []),
    source: "hybrid-parallel",
  };
  searchCache.set(cacheKey, { data: result, expiresAt: Date.now() + SEARCH_TTL });
  return result;
}

// ── resolveStream ─────────────────────────────────────────────────────────────
const streamCache = new Map<string, { url: string; expiresAt: number }>();

/** Helper to wrap a promise with a timeout */
async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: any;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  const result = await Promise.race([promise, timeout]);
  clearTimeout(timer as any);
  return result;
}

function deepFindKey(obj: any, key: string, depth = 0): any {
  if (!obj || typeof obj !== "object" || depth > 12) return null;
  if (!Array.isArray(obj) && Object.prototype.hasOwnProperty.call(obj, key)) return obj[key];
  for (const v of Object.values(obj)) {
    const found = deepFindKey(v, key, depth + 1);
    if (found) return found;
  }
  return null;
}

function firstContinuationToken(obj: any): string | null {
  const cir = deepFindKey(obj, "continuationItemRenderer");
  return cir?.continuationEndpoint?.continuationCommand?.token ?? null;
}

// ── Piped API instances (better than Invidious for audio) ────────────────────
const PIPED_INSTANCES = [
  "https://cf.piped.video",
  "https://api.piped.private.coffee",
  "https://pipedapi.adminforge.de",
];

/**
 * Strategy 1: Piped API — Independent YouTube proxy infrastructure.
 * Does NOT use YouTube directly, bypasses Vercel IP blocks.
 */
async function resolveWithPiped(videoId: string): Promise<string> {
  return Promise.any(PIPED_INSTANCES.map(async (api) => {
    const res = await withTimeout(
      fetch(`${api}/streams/${videoId}`, {
        cache: "no-store",
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Aura/1.0)", "Accept": "application/json" },
        signal: AbortSignal.timeout(3500),
      }), 4000, null
    );
    if (!res || !res.ok) throw new Error("failed");
    const data = await res.json();
    const best = (data.audioStreams ?? []).filter((s: any) => s.url).sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
    if (best?.url) return best.url;
    throw new Error("no url");
  }));
}

/**
 * Strategy 2: @distube/ytdl-core — Maintained fork of ytdl-core with bot bypass.
 */
async function resolveWithYtdlCore(videoId: string): Promise<string> {
  const ytdl = await import("@distube/ytdl-core");
  
  const options: any = {
    requestOptions: {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept-Language": "en-US,en;q=0.9",
      },
    },
  };

  // Add cookie if available
  if (process.env.YOUTUBE_COOKIE) {
    options.requestOptions.headers["Cookie"] = process.env.YOUTUBE_COOKIE;
  }

  const info = await ytdl.default.getInfo(`https://www.youtube.com/watch?v=${videoId}`, options);
  if (!info?.formats) throw new Error("ytdl-core: no formats");

  const audioFormats = ytdl.default
    .filterFormats(info.formats, "audioonly")
    .sort((a: any, b: any) => (b.audioBitrate ?? 0) - (a.audioBitrate ?? 0));

  if (audioFormats.length === 0) throw new Error("ytdl-core: no audio formats");
  if (!audioFormats[0].url) throw new Error("ytdl-core: no url on format");
  
  return audioFormats[0].url;
}

/**
 * Strategy 3: youtubei.js — YouTube's internal InnerTube API.
 */
async function resolveWithYoutubei(videoId: string): Promise<string> {
  const innertube = await getYTWeb();
  
  for (const getter of [
    () => (innertube.music as any).getInfo(videoId),
    () => innertube.getInfo(videoId),
    () => innertube.getInfo(videoId, { client: "TV_EMBEDDED" } as any), // Bypasses age restriction
    () => innertube.getInfo(videoId, { client: "IOS" } as any),      // Bypasses some other restrictions
  ]) {
    try {
      const info = await getter();
      let format: any;
      try { format = (info as any).chooseFormat?.({ type: "audio", quality: "best", format: "mp4" }); } catch {}
      if (!format) {
        try { format = (info as any).chooseFormat?.({ type: "audio", quality: "best" }); } catch {}
      }
      if (!format) {
        try { format = (info as any).chooseFormat?.({ type: "audio" }); } catch {}
      }
      
      if (format?.url) return format.url;
      if (format && ((format as any).signature_cipher || (format as any).cipher)) {
        return (format as any).decipher(innertube.session.player);
      }
    } catch {}
  }
  throw new Error("youtubei: no format found");
}

/**
 * Strategy 4: Invidious public proxy pool.
 */
const PUBLIC_INVIDIOUS = [
  "https://inv.pistasjis.net",
  "https://invidious.flokinet.to",
  "https://invidious.projectsegfau.lt",
  "https://iv.ggtyler.dev",
  "https://invidious.privacydev.net",
  "https://invidious.nerdvpn.de",
];

async function resolveWithInvidious(videoId: string): Promise<string> {
  return Promise.any(PUBLIC_INVIDIOUS.map(async (proxy) => {
    const res = await withTimeout(
      fetch(`${proxy}/api/v1/videos/${videoId}`, { cache: "no-store", headers: { "User-Agent": "Mozilla/5.0" } }), 7000, null
    );
    if (!res || !res.ok) throw new Error("failed");
    const data = await res.json();
    const formats: any[] = data.adaptiveFormats ?? [];
    const best = formats.find((f: any) => f.type?.includes("audio/webm") && f.audioQuality === "AUDIO_QUALITY_MEDIUM") ?? formats.find((f: any) => f.type?.includes("audio"));
    if (best?.url) return best.url;
    throw new Error("no url");
  }));
}

export async function resolveStream(videoId: string): Promise<string> {
  const start = Date.now();
  console.log(`[Stream] Resolving ${videoId} via youtupe-api...`);

  // 1. In-memory process cache (fastest)
  const cached = streamCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  // 2. Redis cache (optional — graceful if unavailable)
  try {
    const redis = getRedisClient();
    const globalCached = await withTimeout(redis.get(`stream:${videoId}`), 1500, null);
    if (globalCached) {
      console.log(`[Stream] Redis cache hit for ${videoId}`);
      streamCache.set(videoId, { url: globalCached, expiresAt: Date.now() + 4 * 60 * 60 * 1000 });
      return globalCached;
    }
  } catch {
    // Redis unavailable on Vercel — continue without it
  }

  const cacheAndReturn = async (url: string): Promise<string> => {
    streamCache.set(videoId, { url, expiresAt: Date.now() + 4 * 60 * 60 * 1000 });
    // Try to cache in Redis (fire and forget, non-blocking)
    try {
      const redis = getRedisClient();
      withTimeout(redis.set(`stream:${videoId}`, url, "EX", 14400), 1000, null).catch(() => {});
    } catch {}
    console.log(`[Stream] ✅ Resolved ${videoId} in ${Date.now() - start}ms`);
    return url;
  };

  const YOUTUBE_API_URL = process.env.YOUTUBE_API_URL || "http://127.0.0.1:3001";
  let url = "";

  try {
    const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const apiUrl = `${YOUTUBE_API_URL}/api/download/mp3?url=${encodeURIComponent(targetUrl)}`;
    
    const res = await fetch(apiUrl);
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.download_url) {
        url = data.download_url;
      }
    }
  } catch (e) {
    console.warn(`[Stream] youtupe-api failed for ${videoId}:`, e);
  }

  // Fallback to youtubei.js if the new API fails
  if (!url) {
    try {
      console.log(`[Stream] Trying youtubei.js fallback for ${videoId}...`);
      url = await withTimeout(resolveWithYoutubei(videoId), 15000, "");
    } catch (e) {
      console.warn(`[Stream] youtubei.js failed for ${videoId}:`, e);
    }
  }

  if (!url) {
    try {
      console.log(`[Stream] Trying public Invidious mirrors for ${videoId}...`);
      url = await withTimeout(resolveWithInvidious(videoId), 8000, "");
    } catch (e) {
      console.warn(`[Stream] Invidious fallback failed for ${videoId}:`, e);
    }
  }

  if (!url) throw new Error("stream_resolve_failed: All resolvers failed");
  return await cacheAndReturn(url);
}

// ── getArtistDetails ──────────────────────────────────────────────────────────
export async function getArtistDetailsYoutube(artistId: string) {
  const innertube = await getYTWeb();
  const rawArtist = await innertube.music.getArtist(artistId);

  const header = rawArtist.header as any;
  const artistName = header?.title?.toString() || "Unknown Artist";
  const thumbBase = header?.thumbnails ?? header?.thumbnail?.contents ?? [];
  const artistImage = getHighResThumbnail(thumbBase) ?? thumbBase[0]?.url ?? null;
  const rawSubscribers = (header as any)?.subscribers?.toString() || "";

  const newReleases: any[] = [];
  const oldAlbums: any[] = [];
  const songs: any[] = [];
  const currentYear = new Date().getFullYear();

  const processedAlbumIds = new Set<string>();
  const songPromises: Promise<any>[] = [];
  const albumPromises: Promise<any>[] = [];

  rawArtist.sections?.forEach((sec: any) => {
    const title = (sec.title?.toString() || sec.header?.title?.toString() || "").toLowerCase();
    
    const isSongs = 
      title.includes("song") || title.includes("أغانى") || title.includes("أغاني") ||
      title.includes("شعبية") || title.includes("popular") || title.includes("top tracks");

    const isAlbums =
      title.includes("album") || title.includes("ألبومات") || title.includes("singles") ||
      title.includes("ep") || title.includes("إصدار") || title.includes("discography") ||
      title.includes("إصدارات");

    if (isSongs) {
      if (sec.endpoint) songPromises.push(sec.endpoint);
      
      sec.contents?.forEach((item: any) => {
        const vid = item.id ?? item.videoId ?? item.endpoint?.payload?.videoId;
        if (!vid) return;
        songs.push({
          songId: vid,
          youtubeVideoId: vid,
          title: sanitizeTitle(item.title?.toString() || ""),
          artist: item.author?.name ?? item.artists?.[0]?.name ?? artistName,
          thumbnailUrl: getHighResThumbnail(item.thumbnails) ?? item.thumbnails?.[0]?.url ?? artistImage ?? "",
          views: item.view_count?.toString() ?? item.subtitle?.toString() ?? "",
        });
      });
    }

    if (isAlbums || (!isSongs && songs.length === 0)) {
      if (sec.endpoint) albumPromises.push(sec.endpoint);
      
      sec.contents?.forEach((item: any) => {
        const id = item.id ?? (item as any).album_id;
        if (!id || processedAlbumIds.has(id)) return;
        processedAlbumIds.add(id);

        const itemYearStr = item.year ?? item.subtitle?.toString() ?? "";
        const yearMatch = itemYearStr.match(/\b(19|20)\d{2}\b/);
        const year = yearMatch ? parseInt(yearMatch[0]) : 0;
        
        const mappedItem = {
          albumId: id,
          title: sanitizeTitle(item.title?.toString() || ""),
          thumbnailUrl: getHighResThumbnail(item.thumbnails ?? item.thumbnail?.contents ?? item.thumbnail) ?? item.thumbnail?.[0]?.url ?? "",
          year,
          artist: artistName,
          songCount: item.song_count || 0,
        };
        if (!mappedItem.title) return;
        if (year >= currentYear - 1) newReleases.push(mappedItem);
        else oldAlbums.push(mappedItem);
      });
    }
  });

  try {
    const extraPromises = [...albumPromises.map(p => ({ p, type: 'albums' })), ...songPromises.map(p => ({ p, type: 'songs' }))];
    
    const runExtra = async (item: any) => {
      try {
        const payload = (item.p as any)?.payload || (item.p as any)?.data;
        const browseId = payload?.browseId;

        // If it's songs and has a playlist browse ID (e.g. VLOLAK...), fetch the playlist directly!
        if (item.type === 'songs' && browseId && (browseId.startsWith('VL') || browseId.startsWith('PL') || browseId.startsWith('OLAK'))) {
          try {
            const pl = await innertube.music.getPlaylist(browseId);
            if (pl.items && pl.items.length > 0) {
              pl.items.forEach((m: any) => {
                const vid = m.id ?? m.videoId;
                if (!vid) return;
                songs.push({
                  songId: vid,
                  youtubeVideoId: vid,
                  title: sanitizeTitle(m.title?.toString() || ""),
                  artist: m.author?.name || m.artists?.[0]?.name || artistName,
                  thumbnailUrl: getHighResThumbnail(m.thumbnails || m.thumbnail?.thumbnails || []) || artistImage || "",
                  views: m.view_count?.toString() || "",
                });
              });
              return;
            }
          } catch (plErr) {
            // fallback to actions.execute below
          }
        }

        const action = (item.p as any)?.action || 'browse';
        const res: any = await (innertube as any).actions.execute(action, payload);

        const findItems = (obj: any, depth = 0): any[] => {
          if (!obj || typeof obj !== 'object' || depth > 10) return [];
          if (Array.isArray(obj)) {
            let items: any[] = [];
            for (const x of obj) {
              if (x?.musicResponsiveListItemRenderer || x?.musicTwoRowItemRenderer || x?.gridVideoRenderer || x?.gridPlaylistRenderer || x?.playlistRenderer) {
                items.push(x);
              } else {
                items = items.concat(findItems(x, depth + 1));
              }
            }
            return items;
          }
          let results: any[] = [];
          for (const key in obj) {
            if (key === 'contents' || key === 'items' || key === 'musicShelfRenderer' || key === 'gridRenderer') {
              const val = obj[key]?.contents || obj[key]?.items || obj[key];
              if (Array.isArray(val)) results = results.concat(val);
              else results = results.concat(findItems(val, depth + 1));
            } else {
              results = results.concat(findItems(obj[key], depth + 1));
            }
          }
          return results;
        };

        // "Show all" discography pages are paginated — follow continuation
        // tokens so prolific artists return ALL albums, not just page 1.
        let contents: any[] = findItems(res.data);
        if (!contents.length) contents = findItems(res.continuationContents);
        if (item.type === 'albums') {
          let nextToken = firstContinuationToken(res.data ?? res);
          for (let page = 0; page < 8 && nextToken; page++) {
            const cont: any = await withTimeout(
              (innertube as any).actions.execute('browse', { continuation: nextToken }).catch(() => null),
              4000,
              null
            );
            if (!cont?.data) break;
            const more = findItems(cont.data);
            if (!more.length) break;
            contents = contents.concat(more);
            const t = firstContinuationToken(cont.data);
            if (!t || t === nextToken) break;
            nextToken = t;
          }
        }

        contents.forEach((v: any) => {
          const m = v.musicResponsiveListItemRenderer || v.musicTwoRowItemRenderer || v.gridVideoRenderer || v.gridPlaylistRenderer || v.playlistRenderer || v;
          if (item.type === 'albums') {
            const id = m.id ?? m.videoId ?? m.browseId ?? m.playlistId
              ?? m.endpoint?.payload?.browseId ?? m.endpoint?.payload?.playlistId
              ?? m.navigationEndpoint?.payload?.browseId ?? m.navigationEndpoint?.payload?.playlistId;
            if (!id || processedAlbumIds.has(id)) return;
            const title = sanitizeTitle(
              m.title?.runs?.map((r: any) => r.text).join("") ||
              m.title?.simpleText ||
              m.title?.toString?.() ||
              m.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text ||
              ""
            );
            if (!title || (typeof id === 'string' && (id.startsWith('UC') || id.startsWith('FEmusic')))) return;
            processedAlbumIds.add(id);
            const textBlob = JSON.stringify([m.subtitle, m.description, m.contextLine, m.flexColumns?.[1]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text]);
            const yearMatch = textBlob.match(/\b(19|20)\d{2}\b/);
            oldAlbums.push({
              albumId: id,
              title,
              thumbnailUrl: getHighResThumbnail(m.thumbnail?.contents || m.thumbnails || m.thumbnail?.thumbnails || []),
              year: yearMatch ? parseInt(yearMatch[0]) : 0,
              artist: artistName,
              songCount: 0
            });
          } else {
             const vid = m.id ?? m.videoId ?? m.endpoint?.payload?.videoId;
             if (!vid) return;
             songs.push({
               songId: vid,
               youtubeVideoId: vid,
               title: sanitizeTitle(m.title?.toString() || m.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || ""),
               artist: artistName,
               thumbnailUrl: getHighResThumbnail(m.thumbnails || m.thumbnail?.thumbnails || []),
             });
          }
        });
      } catch (e) {
        console.warn(`[Artist] Failed to fetch extra ${item.type}`, e);
      }
    };
    await Promise.allSettled(extraPromises.map(runExtra));
  } catch (err) {
    console.warn("[Artist] Discography expansion failed:", err);
  }

  // If songs are still low, enrich with music search
  if (songs.length < 15 && artistName && artistName !== "Unknown Artist") {
    try {
      const searchRes = await innertube.music.search(artistName, { type: "song" });
      const moreSongs = extractSongs(searchRes);
      for (const s of moreSongs) {
        songs.push(s);
      }
    } catch (e) {}
  }

  const uniqueSongs = Array.from(new Map(songs.map(s => [s.songId, s])).values());

  // NB: no id remapping against album tracks here — Telegram cache rows are
  // keyed by these ids; the wrong-song guard is the resolver's artist gate.

  if (uniqueSongs.length === 0 && oldAlbums.length === 0) {
    throw new Error("No artist data found via YouTube API");
  }

  return {
    artistId,
    artistName,
    artistImage,
    subscribers: rawSubscribers,
    isVerified: true,
    songs: uniqueSongs.slice(0, 100),
    newReleases: newReleases.sort((a, b) => b.year - a.year).slice(0, 20),
    oldAlbums: oldAlbums.sort((a, b) => b.year - a.year).slice(0, 300),
  };
}

export async function getChannelDetailsYoutube(channelId: string) {
  const innertube = await getYTWeb();
  const channel = await innertube.getChannel(channelId);
  
  const rawTitle = (channel.metadata as any)?.music_artist_name ||
    (channel.metadata as any)?.title ||
    (channel.header as any)?.title?.toString() ||
    (channel.header as any)?.page_title?.toString() ||
    (channel.header as any)?.author?.name ||
    "Unknown Artist";

  const artistName = sanitizeTitle(rawTitle.replace(/\s*-\s*Topic\s*$/i, "").trim());
  const artistImage = (channel.metadata as any)?.avatar?.[0]?.url ||
    getHighResThumbnail((channel.header as any)?.author?.thumbnails || (channel.header as any)?.avatar?.thumbnails || []) ||
    null;
  const rawSubscribers = (channel.metadata as any)?.subscribers || (channel.header as any)?.subscribers?.toString() || "";

  const songs: any[] = [];
  try {
    const searchRes = await innertube.music.search(artistName, { type: "song" });
    const extracted = extractSongs(searchRes);
    songs.push(...extracted);
  } catch (err) {
    console.warn(`[Artist] Music search failed for channel ${artistName}:`, err);
  }

  if (songs.length === 0) {
    try {
      const searchRes = await searchYouTube(artistName);
      songs.push(...searchRes.songs);
    } catch(err) {
      console.warn(`[Artist] Search fallback failed for ${artistName}:`, err);
    }
  }

  if (songs.length === 0) {
    throw new Error("No channel videos or songs found");
  }
  return {
    artistId: channelId,
    artistName,
    artistImage,
    subscribers: rawSubscribers,
    isVerified: true,
    songs: songs.slice(0, 50),
    newReleases: [],
    oldAlbums: [],
  };
}

export async function getArtistDetails(artistId: string) {
  const cached = artistCache.get(artistId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  let result: any = null;
  try {
    try {
      result = await getArtistDetailsYoutube(artistId);
    } catch (e: any) {
      console.warn(`[Artist] music.getArtist failed for ${artistId}:`, e?.message || e, ", trying getChannel...");
      result = await getChannelDetailsYoutube(artistId);
    }
  } catch (e: any) {
    console.warn(`[Artist] YouTube failed completely for ${artistId}:`, e?.message || e, ", trying Piped fallback...");
    const instances = ["https://cf.piped.video", "https://api.piped.private.coffee", "https://pipedapi.adminforge.de"];
    for (const inst of instances) {
      try {
        const res = await fetch(`${inst}/channel/${artistId}`, {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) continue;
        const data = await res.json();
        const songs = (data.relatedStreams || [])
          .filter((s: any) => s.type === "stream")
          .map((s: any) => ({
            songId: s.url.replace("/watch?v=", ""),
            youtubeVideoId: s.url.replace("/watch?v=", ""),
            title: sanitizeTitle(s.title),
            artist: data.name || "فنان غير معروف",
            thumbnailUrl: s.thumbnail || data.avatarUrl || "",
            views: s.views || 0
          }));

        if (songs.length > 0) {
          result = {
            artistId,
            artistName: data.name || "Unknown Artist",
            artistImage: data.avatarUrl || null,
            subscribers: data.subscriberCount || "",
            isVerified: data.verified || false,
            songs: songs.slice(0, 50),
            newReleases: [],
            oldAlbums: [],
            source: "piped"
          };
          break;
        }
      } catch (err) {}
    }
  }

  if (!result || !result.songs || result.songs.length === 0) {
    return {
      artistId,
      artistName: result?.artistName || "Unknown Artist",
      artistImage: result?.artistImage || null,
      subscribers: "",
      isVerified: false,
      songs: [],
      newReleases: [],
      oldAlbums: [],
      source: "error"
    };
  }

  artistCache.set(artistId, { data: result, expiresAt: Date.now() + ARTIST_TTL });
  return result;
}

export async function getAlbumDetailsYoutube(albumId: string) {
  const cached = albumCache.get(albumId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const innertube = await getYTWeb();
  const rawAlbum = await innertube.music.getAlbum(albumId);

  const header = rawAlbum.header as any;
  const artist =
    header?.strapline_text_one?.toString() ??
    header?.author?.name ??
    header?.author?.[0]?.name ??
    "Unknown Artist";
  const title = header?.title?.toString() || "Unknown Album";
  const thumbsBase = header?.thumbnails ?? header?.thumbnail?.contents ?? header?.thumbnail ?? [];
  const coverUrl = getHighResThumbnail(thumbsBase) ?? thumbsBase[0]?.url ?? null;
  const year = header?.year?.toString() ?? header?.subtitle?.toString() ?? "";

  const songs = (rawAlbum.contents ?? [])
    .map((track: any) => ({
      songId: track.id ?? track.videoId ?? track.endpoint?.payload?.videoId,
      title: sanitizeTitle(track.title?.toString() ?? track.name ?? ""),
      artist: track.author?.name ?? track.artists?.[0]?.name ?? artist,
      youtubeVideoId: track.id ?? track.videoId ?? track.endpoint?.payload?.videoId,
      thumbnailUrl: coverUrl,
    }))
    .filter((s: any) => s.songId && s.title);

  const result = { albumId, title, artist, coverUrl, year, songs };
  if (songs.length === 0) throw new Error("No album data");
  albumCache.set(albumId, { data: result, expiresAt: Date.now() + 60 * 60 * 1000 });
  return result;
}

export async function getAlbumDetails(albumId: string) {
  try {
    return await getAlbumDetailsYoutube(albumId);
  } catch (e) {
    console.warn(`[Album] YouTube failed for ${albumId}, trying Piped fallback...`);
    const instances = ["https://cf.piped.video", "https://api.piped.private.coffee", "https://pipedapi.adminforge.de"];
    
    for (const instance of instances) {
      try {
        const res = await fetch(`${instance}/playlists/${albumId}`, {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) continue;
        
        const data = await res.json();
        const songs = (data.relatedStreams || [])
          .map((s: any) => ({
            songId: s.url.replace("/watch?v=", ""),
            youtubeVideoId: s.url.replace("/watch?v=", ""),
            title: sanitizeTitle(s.title),
            artist: data.uploaderName || data.uploader || "فنان غير معروف",
            thumbnailUrl: s.thumbnail || data.thumbnailUrl || ""
          }));

        return {
          albumId,
          title: data.name || "Unknown Album",
          artist: data.uploader || "Unknown Artist",
          coverUrl: data.thumbnailUrl || null,
          year: "",
          songs,
          source: "piped"
        };
      } catch (err) {
        console.error(`[Album] Piped fallback failed on ${instance}`);
      }
    }
    
    return { albumId, title: "Unknown Album", artist: "Unknown", coverUrl: null, year: "", songs: [], source: "error" };
  }
}

export async function getMoodMix(mood: string) {
  const innertube = await getYTWeb();
  const results = await innertube.music.search(`${mood} مصري`, { type: "playlist" });
  const playlists = (results as any).playlists?.contents ?? (results as any).contents;
  if (!playlists?.length) return [];

  try {
    const playlistId = (playlists[0] as any).id;
    if (!playlistId) return [];
    const playlist = await innertube.music.getPlaylist(playlistId);
    if (!playlist?.items) return [];
    return playlist.items
      .map((v: any) => ({
        songId: v.id,
        title: sanitizeTitle(v.title?.toString() || ""),
        artist: v.author?.name ?? v.artists?.[0]?.name ?? "فنان غير معروف",
        youtubeVideoId: v.id,
        thumbnailUrl: getHighResThumbnail(v.thumbnails),
      }))
      .filter((v: any) => v.songId)
      .slice(0, 50);
  } catch (e) {
    console.error("DJ Mixing error:", e);
    return [];
  }
}

// ── getLyricsYoutube ──────────────────────────────────────────────────────────
export interface SyncedLyricsResult {
  plainLyrics: string;
  syncedLyrics: string;
  source: string;
}

/**
 * Auto-captions switch to a rolling window during dense vocal sections: the same
 * sentence is re-emitted every ~0.7s as growing fragments. Rendered as-is it looks
 * like machine spam, so collapse each rolling run into its fullest line.
 */
function condenseRollingCaptions(
  segments: { timeMs: number; text: string }[]
): { timeMs: number; text: string }[] {
  const tokens = (text: string) => new Set(text.split(/\s+/).filter((w) => w.length > 1));
  const overlap = (a: Set<string>, b: Set<string>) => {
    if (a.size === 0 || b.size === 0) return 0;
    let shared = 0;
    for (const w of a) if (b.has(w)) shared++;
    return shared / Math.min(a.size, b.size);
  };

  const out: { timeMs: number; text: string }[] = [];
  let run: { timeMs: number; text: string }[] = [];

  const flush = () => {
    if (run.length === 0) return;
    if (run.length === 1) {
      out.push(run[0]);
    } else {
      // Keep the most complete sentence for the whole run, timed at its start.
      const fullest = run.reduce((best, cur) => (cur.text.length > best.text.length ? cur : best), run[0]);
      out.push({ timeMs: run[0].timeMs, text: fullest.text });
    }
    run = [];
  };

  for (const seg of segments) {
    const prev = run.length ? run[run.length - 1] : null;
    const prevPrev = run.length > 1 ? run[run.length - 2] : null;

    if (prev && prev.text === seg.text) continue;

    const isRolling =
      prev &&
      seg.timeMs - prev.timeMs <= 1600 &&
      prev.text.length >= 18 &&
      seg.text.length >= 18 &&
      (seg.text.includes(prev.text) ||
        prev.text.includes(seg.text) ||
        overlap(tokens(prev.text), tokens(seg.text)) >= 0.35);

    const followsRun =
      isRolling ||
      (prevPrev &&
        prev &&
        seg.timeMs - prev.timeMs <= 1600 &&
        prev.timeMs - prevPrev.timeMs <= 1600 &&
        seg.text.length >= 18 &&
        prev.text.length >= 18 &&
        overlap(tokens(prev.text), tokens(seg.text)) >= 0.3);

    if (followsRun) {
      run.push(seg);
    } else {
      flush();
      run = [seg];
    }
  }
  flush();
  return out;
}

export async function getSyncedLyricsYoutube(videoId: string): Promise<SyncedLyricsResult | null> {
  try {
    const innertube = await getYTWeb();
    const info = await innertube.getInfo(videoId);
    const tracks = info.captions?.caption_tracks || [];

    if (tracks.length > 0) {
      // Prefer the auto-generated Arabic track: translated/derived tracks repeat
      // the same timings but carry another language.
      const track =
        tracks.find((t: any) => t.language_code === "ar" && t.kind === "asr") ||
        tracks.find((t: any) => t.language_code === "ar") ||
        tracks.find((t: any) => (t.language_code || "").toLowerCase().startsWith("ar")) ||
        tracks.find((t: any) => t.name?.text?.toLowerCase().includes("arabic")) ||
        tracks.find((t: any) => t.language_code === "en") ||
        tracks[0];

      if (track?.base_url) {
        const res = await fetch(`${track.base_url}&fmt=json3`, { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
          const data = await res.json();
          const events = data?.events || [];
          const validSegments: { timeMs: number; text: string }[] = [];
          const seenTimes = new Set<number>();

          for (const ev of events) {
            if (!ev.segs || typeof ev.tStartMs !== "number") continue;
            const lineText = ev.segs
              .map((s: any) => s.utf8 || "")
              .join("")
              .replace(/\[(?:موسيقى|غناء|تصفيق|music|applause|singing)\]/gi, " ")
              .replace(/^\s*>>+\s*/, "")
              .replace(/[♪♫]+/g, " ")
              .replace(/\n+/g, " ")
              .replace(/\s+/g, " ")
              .trim();

            // Filter sound-effect markers and empty/duplicate rolling events
            if (!lineText || /^\[.*\]$/.test(lineText)) continue;
            if (seenTimes.has(ev.tStartMs)) continue;
            seenTimes.add(ev.tStartMs);

            validSegments.push({
              timeMs: ev.tStartMs,
              text: lineText,
            });
          }

          const cleanedSegments = condenseRollingCaptions(validSegments);

          if (cleanedSegments.length >= 3) {
            // Build LRC format: [mm:ss.xx]
            const lrcLines = cleanedSegments.map((seg) => {
              const totalSec = seg.timeMs / 1000;
              const min = Math.floor(totalSec / 60);
              const sec = (totalSec % 60).toFixed(2);
              const mm = String(min).padStart(2, "0");
              const ss = String(sec).padStart(5, "0");
              return `[${mm}:${ss}] ${seg.text}`;
            });

            const plainLines = cleanedSegments.map((s) => s.text);

            return {
              plainLyrics: plainLines.join("\n"),
              syncedLyrics: lrcLines.join("\n"),
              source: "youtube-timedtext",
            };
          }
        }
      }
    }

    // Fallback: Check YouTube Music description plain lyrics
    try {
      const musicInfo = await innertube.music.getInfo(videoId);
      const lyricsObj: any = await musicInfo.getLyrics();
      const lyricsText = lyricsObj?.description?.text || lyricsObj?.text;
      if (lyricsText && lyricsText.trim().length > 10) {
        return {
          plainLyrics: lyricsText.trim(),
          syncedLyrics: "",
          source: "youtubei-music",
        };
      }
    } catch {}
  } catch (e: any) {
    console.warn(`[Lyrics] youtubei.js failed to get synced lyrics for ${videoId}:`, e.message);
  }
  return null;
}

export async function getLyricsYoutube(videoId: string): Promise<string | null> {
  const synced = await getSyncedLyricsYoutube(videoId);
  return synced?.plainLyrics || null;
}

// ── Real publish dates — used to verify a release dropped TODAY ──────────────
const publishDateCache = new Map<string, { ms: number; expiresAt: number }>();

export async function getVideoPublishDateMs(videoId: string): Promise<number | null> {
  const key = `pub:${videoId}`;
  const hit = publishDateCache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.ms;

  try {
    const redis = getRedisClient();
    const cached = await withTimeout(redis.get(key), 1200, null);
    if (cached) {
      const ms = Number(cached);
      if (ms > 0) {
        publishDateCache.set(key, { ms, expiresAt: Date.now() + 6 * 3600e3 });
        return ms;
      }
    }
  } catch {}

  try {
    const innertube = await getYTWeb();
    const info: any = await innertube.getBasicInfo(videoId);
    const mf = info?.microformat?.playerMicroformatRenderer;
    const iso = mf?.publishDate || mf?.uploadDate;
    if (!iso) return null;
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return null;
    publishDateCache.set(key, { ms, expiresAt: Date.now() + 6 * 3600e3 });
    try {
      const redis = getRedisClient();
      withTimeout(redis.set(key, String(ms), "EX", 3 * 24 * 3600), 1000, null).catch(() => {});
    } catch {}
    return ms;
  } catch (e: any) {
    console.warn(`[PublishDate] Failed for ${videoId}:`, e?.message);
    return null;
  }
}

export type FreshRelease = {
  albumId: string;
  title: string;
  artist: string;
  thumbnailUrl: string | null;
  videoId: string | null;
  publishedAt: number;
  kind: "song" | "album";
};

/**
 * Verified fresh releases for an artist: candidates are this-year entries of
 * the artist page; each is confirmed against the real YouTube publish date of
 * its first track, keeping only those published within maxAgeHours.
 */
export async function getFreshReleases(
  artistId: string,
  maxAgeHours = 36,
  artistNameHint?: string
): Promise<FreshRelease[]> {
  const artist: any = await getArtistDetails(artistId).catch(() => null);
  const artistName = artist?.artistName || artistNameHint;
  if (!artistName) return [];

  const year = new Date().getFullYear();
  const candidates = [...(artist.newReleases || [])]
    .filter((r: any) => r.albumId && r.year >= year)
    .slice(0, 4);

  const cutoff = Date.now() - maxAgeHours * 3600e3;
  const settled = await Promise.allSettled(
    candidates.map(async (r: any): Promise<FreshRelease | null> => {
      let videoId: string | null = null;
      try {
        const album: any = await getAlbumDetails(r.albumId);
        videoId = album?.songs?.[0]?.youtubeVideoId || album?.songs?.[0]?.songId || null;
      } catch {}
      if (!videoId) return null;
      const ms = await getVideoPublishDateMs(videoId);
      if (!ms || ms < cutoff) return null;
      return {
        albumId: r.albumId,
        title: r.title,
        artist: artistName,
        thumbnailUrl: r.thumbnailUrl || null,
        videoId,
        publishedAt: ms,
        kind: (r.songCount || 0) > 1 ? "album" : "song",
      };
    })
  );

  return settled
    .map((s) => (s.status === "fulfilled" ? s.value : null))
    .filter((r): r is FreshRelease => !!r)
    .sort((a, b) => b.publishedAt - a.publishedAt);
}
