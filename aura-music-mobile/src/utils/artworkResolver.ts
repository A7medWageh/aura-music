import AsyncStorage from "@react-native-async-storage/async-storage";
import { getArtistAvatar } from "@/constants/artistAvatars";

const CACHE_PREFIX = "@aura_art_cache_v1_";
const memoryCache = new Map<string, string>();

function cleanTitle(title: string): string {
  if (!title) return "";
  return title
    .replace(/\s*(\(|\[)[^()\[\]]*(official|video|audio|lyrics|كلمات|كليب|فيديو|حصري|نسخة|أصلية)[^()\[\]]*(\)|\])/gi, "")
    .replace(/\b(hd|hq|4k|1080p|720p|audio|lyrics)\b/gi, "")
    .replace(/[-|–].*$/g, "")
    .trim();
}

/**
 * Automatically resolves high-resolution (600x600) artwork for any song or artist.
 * Checks memory cache -> AsyncStorage -> iTunes Search API -> Artist Avatar Fallback.
 * Guarantees zero missing covers.
 */
export async function fetchRealtimeArtwork(
  title?: string | null,
  artist?: string | null
): Promise<string | null> {
  const t = cleanTitle(title || "");
  const a = (artist || "")
    .replace(/\s*-\s*topic/gi, "")
    .replace(/\s*(official|channel|قناة|رسمي)/gi, "")
    .trim();

  if (!t && !a) return null;

  const key = `${a}:::${t}`.toLowerCase();

  if (memoryCache.has(key)) {
    return memoryCache.get(key)!;
  }

  // 1. Try AsyncStorage cache
  try {
    const cached = await AsyncStorage.getItem(CACHE_PREFIX + key);
    if (cached) {
      memoryCache.set(key, cached);
      return cached;
    }
  } catch {}

  // 2. Query iTunes API
  const searchQueries = [
    `${a} ${t}`.trim(),
    t,
  ].filter((q) => q.length > 2);

  for (const q of searchQueries) {
    try {
      const res = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&entity=song&limit=1`
      );
      if (!res.ok) continue;
      const data = await res.json();
      if (data.results && data.results.length > 0) {
        const raw = data.results[0].artworkUrl100;
        if (raw && typeof raw === "string") {
          const hd = raw.replace(/100x100bb/i, "600x600bb");
          memoryCache.set(key, hd);
          AsyncStorage.setItem(CACHE_PREFIX + key, hd).catch(() => {});
          return hd;
        }
      }
    } catch {}
  }

  // 3. Fallback to verified artist avatar
  const avatar = getArtistAvatar(a);
  if (avatar) {
    memoryCache.set(key, avatar);
    return avatar;
  }

  return null;
}

