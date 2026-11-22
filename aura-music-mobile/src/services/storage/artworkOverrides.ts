import AsyncStorage from "@react-native-async-storage/async-storage";
import { normalizeArabicName } from "@/utils/latinize";

const STORAGE_KEY = "@aura_artist_artwork_overrides_v1";

let memoryCache: Record<string, string> | null = null;

export async function getArtistArtworkOverrides(): Promise<Record<string, string>> {
  if (memoryCache) return memoryCache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    memoryCache = parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    memoryCache = {};
  }
  return memoryCache!;
}

export async function setArtistArtworkOverride(
  artistName: string,
  url: string | null
): Promise<Record<string, string>> {
  const map = await getArtistArtworkOverrides();
  const key = normalizeArabicName(artistName);
  if (!key) return map;

  const next = { ...map };
  if (url) next[key] = url;
  else delete next[key];
  memoryCache = next;

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}

  return next;
}
