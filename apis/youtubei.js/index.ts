import { Innertube, UniversalCache } from "youtubei.js";
import * as dns from "node:dns";

// Fix for ENOTFOUND errors in environments where IPv6 is flaky
dns.setDefaultResultOrder("ipv4first");
import * as path from "path";
import { getRedisClient } from "../redis";
import { resolveAlbumatyStream } from "../../src/services/scrapers/albumaty";

const YT_DLP_PATH = process.env.YT_DLP_PATH || path.join(process.cwd(), "yt-dlp-master", "yt-dlp.cmd");

// ── Singleton instances ───────────────────────────────────────────────────────
let ytWeb: Innertube | null = null;
let ytInitPromise: Promise<Innertube> | null = null;

async function getYTWeb(): Promise<Innertube> {
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

export function sanitizeTitle(title: string) {
  return title
    .replace(/\(Official.*?\)/gi, "")
    .replace(/\[Official.*?\]/gi, "")
    .replace(/\(Lyric.*?\)/gi, "")
    .replace(/\[Lyric.*?\]/gi, "")
    .replace(/\|.*/g, "")
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

// ── getMusicCharts ────────────────────────────────────────────────────────────
export async function getMusicCharts() {
  try {
    const innertube = await getYTWeb();
    const explore = await innertube.music.getExplore();
    const trendingList = explore.sections?.find(
      (s: any) => (s.header?.title?.toString() === "Trending" || s.header?.title?.text === "Trending")
    )?.contents;
    if (trendingList?.length) {
      return trendingList
        .map((v: any) => ({
          songId: v.id,
          title: sanitizeTitle(v.title?.toString() || ""),
          artist: v.author?.name ?? v.artists?.[0]?.name ?? "فنان غير معروف",
          youtubeVideoId: v.id,
          thumbnailUrl: getHighResThumbnail(v.thumbnails),
        }))
        .filter((v: any) => v.songId)
        .slice(0, 50);
    }
  } catch (e) {
    console.warn("[Charts] Explore failed, using fallback");
  }

  const innertube = await getYTWeb();
  const results = await innertube.music.search("تريند مصر", { type: "song" });
  return extractSongs(results).slice(0, 30);
}

// ── getNewReleases ────────────────────────────────────────────────────────────
export async function getNewReleases() {
  const innertube = await getYTWeb();
  const results = await innertube.music.search("احدث الاغاني المصرية 2026 حصريا", { type: "song" });
  return extractSongs(results).slice(0, 50);
}

// ── searchYouTube ─────────────────────────────────────────────────────────────
export async function searchYouTube(query: string) {
  const cacheKey = query.trim().toLowerCase();
  const cached = searchCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.data;
  }

  const innertube = await getYTWeb();

  const [generalResults, songResults, artistResults] = await Promise.all([
    innertube.music.search(query).catch(() => null),
    innertube.music.search(query, { type: "song" }).catch(() => null),
    innertube.music.search(query, { type: "artist" }).catch(() => null),
  ]);

  const songMap = new Map<string, any>();
  [...extractSongs(generalResults), ...extractSongs(songResults ?? {})].forEach(
    (s) => { if (s.songId && !songMap.has(s.songId)) songMap.set(s.songId, s); }
  );
  const songs = Array.from(songMap.values()).slice(0, 20);
  const albums = extractAlbums(generalResults).slice(0, 8);
  const artists = extractArtists(generalResults, artistResults).slice(0, 5);

  const result = { query, songs, albums, artists };
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

// ── Piped API instances (better than Invidious for audio) ────────────────────
const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://piped-api.garudalinux.org",
  "https://api.piped.yt",
  "https://pipedapi.kescher.at",
  "https://piped.video/api",
];

/**
 * Strategy 1: Piped API — Independent YouTube proxy infrastructure.
 * Does NOT use YouTube directly, bypasses Vercel IP blocks.
 */
async function resolveWithPiped(videoId: string): Promise<string> {
  for (const api of PIPED_INSTANCES) {
    try {
      const res = await withTimeout(
        fetch(`${api}/streams/${videoId}`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (compatible; Aura/1.0)",
            "Accept": "application/json",
          },
        }),
        8000,
        null
      );
      if (!res || !res.ok) continue;
      const data = await res.json();
      
      // audioStreams is the primary source in Piped API
      const audioStreams: any[] = data.audioStreams ?? [];
      if (!audioStreams.length) continue;

      // Sort by bitrate descending and pick best
      const best = audioStreams
        .filter((s: any) => s.url && s.bitrate)
        .sort((a: any, b: any) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0];
        
      if (best?.url) {
        console.log(`[Stream] Piped hit: ${api} bitrate=${best.bitrate}`);
        return best.url;
      }
    } catch {
      // try next
    }
  }
  throw new Error("piped: all instances failed");
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
  ]) {
    try {
      const info = await getter();
      const format = (info as any).chooseFormat?.({ type: "audio", quality: "best", format: "mp4" }) ??
                     (info as any).chooseFormat?.({ type: "audio", quality: "best" });
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
  for (const proxy of PUBLIC_INVIDIOUS) {
    try {
      const res = await withTimeout(
        fetch(`${proxy}/api/v1/videos/${videoId}`, {
          headers: { "User-Agent": "Mozilla/5.0" },
        }),
        6000,
        null
      );
      if (res && res.ok) {
        const data = await res.json();
        const formats: any[] = data.adaptiveFormats ?? [];
        const audioFmt =
          formats.find((f: any) => f.type?.includes("audio/webm") && f.audioQuality === "AUDIO_QUALITY_MEDIUM") ??
          formats.find((f: any) => f.type?.includes("audio")) ??
          null;
        if (audioFmt?.url) {
          console.log(`[Stream] Invidious hit: ${proxy}`);
          return audioFmt.url;
        }
      }
    } catch {
      // try next proxy
    }
  }
  throw new Error("invidious: all proxies failed");
}

export async function resolveStream(videoId: string): Promise<string> {
  const start = Date.now();
  console.log(`[Stream] Resolving ${videoId}...`);

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

  // Enforce a strict 28-second global timeout
  return withTimeout(
    (async () => {
      // ── Strategy 1: Piped API (Primary — bypasses Vercel IP blocks) ────────
      try {
        console.log(`[Stream] Trying Piped API for ${videoId}...`);
        const url = await withTimeout(resolveWithPiped(videoId), 12000, "");
        if (url) return await cacheAndReturn(url);
      } catch (e: any) {
        console.warn(`[Stream] Piped failed: ${e.message}`);
      }

      // ── Strategy 2: @distube/ytdl-core ──────────────────────────────────
      try {
        console.log(`[Stream] Trying ytdl-core for ${videoId}...`);
        const url = await withTimeout(resolveWithYtdlCore(videoId), 12000, "");
        if (url) return await cacheAndReturn(url);
      } catch (e: any) {
        console.warn(`[Stream] ytdl-core failed: ${e.message}`);
      }

      // ── Strategy 3: Invidious Public Proxy Pool ─────────────────────────
      try {
        console.log(`[Stream] Trying Invidious for ${videoId}...`);
        const url = await withTimeout(resolveWithInvidious(videoId), 10000, "");
        if (url) return await cacheAndReturn(url);
      } catch (e: any) {
        console.warn(`[Stream] Invidious failed: ${e.message}`);
      }

      // ── Strategy 4: youtubei.js ─────────────────────────────────────────
      try {
        console.log(`[Stream] Trying youtubei.js for ${videoId}...`);
        const url = await withTimeout(resolveWithYoutubei(videoId), 10000, "");
        if (url) return await cacheAndReturn(url);
      } catch (e: any) {
        console.warn(`[Stream] youtubei.js failed: ${e.message}`);
      }

      // ── Strategy 5: Albumaty Direct MP3 (for Arabic music) ──────────────
      try {
        let title = "";
        let artist = "";
        try {
          const innertube = await getYTWeb();
          const info = await withTimeout(innertube.getBasicInfo(videoId), 4000, null);
          title = info?.basic_info?.title || "";
          artist = info?.basic_info?.author || "";
        } catch {}

        if (title) {
          console.log(`[Stream] Trying Albumaty for: ${title}...`);
          const url = await withTimeout(
            resolveAlbumatyStream(sanitizeTitle(title), artist),
            6000,
            null
          );
          if (url) return await cacheAndReturn(url);
        }
      } catch (e: any) {
        console.warn(`[Stream] Albumaty failed: ${e.message}`);
      }

      // ── Strategy 6: yt-dlp (Local dev only) ─────────────────────────────
      try {
        const { existsSync } = await import("fs");
        if (existsSync(YT_DLP_PATH)) {
          const { exec } = await import("child_process");
          const { promisify } = await import("util");
          const execPromise = promisify(exec);
          console.log(`[Stream] Trying yt-dlp (dev mode) for ${videoId}...`);
          const { stdout } = await execPromise(
            `"${YT_DLP_PATH}" -g -f "bestaudio[ext=m4a]/bestaudio" --no-playlist "https://www.youtube.com/watch?v=${videoId}"`
          );
          const url = stdout.trim();
          if (url) return await cacheAndReturn(url);
        }
      } catch (e: any) {
        console.warn(`[Stream] yt-dlp failed: ${e.message}`);
      }

      throw new Error("stream_resolve_failed: all strategies exhausted");
    })(),
    28000,
    ""
  ).then((res) => {
    if (!res) throw new Error("stream_resolve_timeout");
    return res;
  });
}

// ── getArtistDetails ──────────────────────────────────────────────────────────
export async function getArtistDetails(artistId: string) {
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
    
    for (const item of extraPromises) {
      try {
        const action = (item.p as any).action || 'browse';
        const payload = (item.p as any).payload || (item.p as any).data;
        
        const res: any = await (innertube as any).actions.execute(action, payload);
        
        let contents: any[] = [];
        const findItems = (obj: any): any[] => {
          if (!obj || typeof obj !== 'object') return [];
          if (Array.isArray(obj)) {
            let items: any[] = [];
            for (const x of obj) {
              if (x?.musicResponsiveListItemRenderer || x?.gridVideoRenderer || x?.gridPlaylistRenderer || x?.playlistRenderer) {
                items.push(x);
              } else {
                items = items.concat(findItems(x));
              }
            }
            return items;
          }
          let results: any[] = [];
          for (const key in obj) {
            if (key === 'contents' || key === 'items' || key === 'musicShelfRenderer' || key === 'gridRenderer') {
              const val = obj[key]?.contents || obj[key]?.items || obj[key];
              if (Array.isArray(val)) results = results.concat(val);
              else results = results.concat(findItems(val));
            } else {
              results = results.concat(findItems(obj[key]));
            }
          }
          return results;
        };

        contents = findItems(res.data);
        if (!contents.length) contents = findItems(res.continuationContents);
        
        contents.forEach((v: any) => {
          const m = v.musicResponsiveListItemRenderer || v.gridVideoRenderer || v.gridPlaylistRenderer || v.playlistRenderer || v;
          if (item.type === 'albums') {
            const id = m.id ?? m.videoId ?? m.browseId ?? m.playlistId ?? (m.endpoint?.payload?.browseId || m.endpoint?.payload?.playlistId);
            if (!id || processedAlbumIds.has(id)) return;
            processedAlbumIds.add(id);
            oldAlbums.push({
              albumId: id,
              title: sanitizeTitle(m.title?.toString() || m.flexColumns?.[0]?.musicResponsiveListItemFlexColumnRenderer?.text?.runs?.[0]?.text || ""),
              thumbnailUrl: getHighResThumbnail(m.thumbnails || m.thumbnail?.thumbnails || []),
              year: 0, artist: artistName, songCount: 0
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
    }
  } catch (err) {
    console.warn("[Artist] Discography expansion failed:", err);
  }

  const uniqueSongs = Array.from(new Map(songs.map(s => [s.songId, s])).values());

  return {
    artistId,
    artistName,
    artistImage,
    subscribers: rawSubscribers,
    isVerified: true,
    songs: uniqueSongs.slice(0, 100),
    newReleases: newReleases.sort((a, b) => b.year - a.year).slice(0, 20),
    oldAlbums: oldAlbums.sort((a, b) => b.year - a.year).slice(0, 150),
  };
}

export async function getAlbumDetails(albumId: string) {
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
  albumCache.set(albumId, { data: result, expiresAt: Date.now() + 60 * 60 * 1000 });
  return result;
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
