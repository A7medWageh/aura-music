import { Innertube, UniversalCache } from "youtubei.js";
import * as dns from "node:dns";
import { exec } from "child_process";

// Fix for ENOTFOUND errors in environments where IPv6 is flaky
dns.setDefaultResultOrder("ipv4first");
import * as path from "path";
import { promisify } from "util";
import { getRedisClient } from "../redis";
import { resolveAlbumatyStream } from "../../src/services/scrapers/albumaty";

const execPromise = promisify(exec);
const YT_DLP_PATH = path.join(process.cwd(), "yt-dlp-master", "yt-dlp.cmd");

// ── Singleton instances ───────────────────────────────────────────────────────
// These are reused across requests in the same process (Next.js server stays alive
// between requests in dev; in production the process is long-lived too).
let ytWeb: Innertube | null = null;
let ytInitPromise: Promise<Innertube> | null = null;

async function getYTWeb(): Promise<Innertube> {
  if (ytWeb) return ytWeb;
  // Prevent parallel initialisation (only create once)
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
    // Google CDN hosts use common parameter formats:
    // 1. =w120-h120-...
    // 2. =s120-...
    // 3. /w120-h120/... (less common for these domains)
    
    // We want the highest quality. =s0 or =s1080 are usually best.
    // Try to replace any existing size parameter with =s1080
    if (bestUrl.includes("=")) {
      return bestUrl.replace(/=[^/]+$/, "=s1080");
    }
    // If no parameter at all, append it
    return `${bestUrl}=s1080`;
  } else if (bestUrl.includes("i.ytimg.com")) {
    return bestUrl.replace(/\/(?:hq)?default\.jpg/, "/maxresdefault.jpg");
  }
  return bestUrl;
}

// ── Helper to safely extract songs from any YouTube Music search response ────
function extractSongs(results: any): any[] {
  // YouTube Music can put songs in results.songs.contents OR results.contents
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

  // Run all searches in parallel for maximum speed
  const [generalResults, songResults, artistResults] = await Promise.all([
    innertube.music.search(query).catch(() => null),
    innertube.music.search(query, { type: "song" }).catch(() => null),
    innertube.music.search(query, { type: "artist" }).catch(() => null),
  ]);

  // Merge & deduplicate songs from both searches
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

export async function resolveStream(videoId: string): Promise<string> {
  const start = Date.now();
  console.log(`[Stream] Resolving ${videoId}...`);

  // 1. In-memory process cache (fastest)
  const cached = streamCache.get(videoId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;

  const redis = getRedisClient();
  const cache = async (url: string) => {
    streamCache.set(videoId, { url, expiresAt: Date.now() + 4 * 60 * 60 * 1000 });
    withTimeout(redis.set(`stream:${videoId}`, url, "EX", 14400), 1000, null).catch(() => {});
    return url;
  };

  // Enforce a strict 30-second global timeout for the entire resolution process
  return withTimeout(
    (async () => {
      // 2. Global Redis cache
      try {
        const globalCached = await withTimeout(redis.get(`stream:${videoId}`), 1000, null);
        if (globalCached) return globalCached;
      } catch (err) {}

      // 2. Parallel Strategy: Try Albumaty & YouTube Info simultaneously
      let title = "";
      let artist = "";
      
      try {
        const innertube = await getYTWeb();
        const mainInfo = await innertube.getBasicInfo(videoId).catch(() => null);
        title = mainInfo?.basic_info?.title || "";
        artist = mainInfo?.basic_info?.author || "";
        
        console.log(`[Stream] Starting parallel resolution for ${title || videoId}...`);
        
        const result = await Promise.any([
          // Strategy A: Albumaty (Direct MP3)
          (async () => {
             if (!title) throw new Error("no_title");
             const url = await resolveAlbumatyStream(sanitizeTitle(title), artist);
             if (!url) throw new Error("albumaty_no_hit");
             console.log(`[Stream] Albumaty hit for ${title}!`);
             return url;
          })(),
          // Strategy B: YouTube Primary (Try music first, then main)
          (async () => {
             for (const method of ['getInfo', 'getBasicInfo']) {
               try {
                 const info = await (innertube.music as any)[method === 'getInfo' ? 'getInfo' : 'getBasicInfo'](videoId);
                 const format = (info as any).chooseFormat?.({ type: "audio", quality: "best", format: "mp4" }) ??
                                (info as any).chooseFormat?.({ type: "audio", quality: "best" });
                 if (format?.url) return format.url;
                 if (format && ((format as any).signature_cipher || (format as any).cipher)) {
                    return (format as any).decipher(innertube.session.player);
                 }
               } catch (e) {}
             }
             // Last chance: Try standard getInfo
             const info = await innertube.getInfo(videoId);
             const fmt = info.chooseFormat({ type: "audio", quality: "best" });
             if (fmt?.url) return fmt.url;
             throw new Error("youtube_no_format");
          })()
        ]).catch(() => null);

        if (result) return await cache(result);
      } catch (err: any) {
        console.warn(`[Stream] Strategy set 1 failed for ${videoId}: ${err.message}`);
      }

      // 4. Fallback: Mirror Search
      try {
          console.log(`[Stream] Trying mirror search for ${videoId}...`);
          const innertube = await getYTWeb();
          const searchTitle = title ? `${title} ${artist}` : videoId;
          const search: any = await innertube.music.search(searchTitle, { type: "song" }).catch(() => null);
          const mirror = search?.songs?.contents?.find((v: any) => (v.id || v.videoId) !== videoId) || 
                         search?.contents?.find((v: any) => (v.id || v.videoId) !== videoId);
          if (mirror) {
            const mirrorId = mirror.id || mirror.videoId;
            const info = await (innertube.music as any).getInfo(mirrorId).catch(() => innertube.getInfo(mirrorId));
            const fmt = (info as any).chooseFormat({ type: "audio", quality: "best" });
            if (fmt?.url) return await cache(fmt.url);
          }
      } catch (err: any) {
        console.warn(`[Stream] Mirror search failed: ${err?.message || "Unknown error"}`);
      }

      // 5. Last Resort: yt-dlp
      try {
        const fs = await import("fs");
        if (fs.existsSync(YT_DLP_PATH)) {
          console.log(`[Stream] Last resort yt-dlp for ${videoId}...`);
          const { stdout } = await execPromise(`"${YT_DLP_PATH}" -g -f "bestaudio[ext=m4a]/bestaudio" --no-playlist "${videoId}"`);
          const url = stdout.trim();
          if (url) return await cache(url);
        }
      } catch (err: any) {
        console.error(`[Stream] All resolution methods failed for ${videoId}: ${err.message}`);
      }

      throw new Error("stream_resolve_failed");
    })(),
    30000,
    ""
  ).then(res => {
    if (!res) throw new Error("stream_resolve_timeout");
    console.log(`[Stream] Resolved ${videoId} in ${Date.now() - start}ms`);
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

  // Parallel fetch extra content (Albums/Singles full lists)
  try {
    const extraPromises = [...albumPromises.map(p => ({ p, type: 'albums' })), ...songPromises.map(p => ({ p, type: 'songs' }))];
    
    for (const item of extraPromises) {
      try {
        const action = (item.p as any).action || 'browse';
        const payload = (item.p as any).payload || (item.p as any).data;
        
        const res: any = await (innertube as any).actions.execute(action, payload);
        
        // Broad search for any list items in the response
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
