/**
 * FavoritesStore – client-side persistent favorites using localStorage.
 *
 * The /api/likes route stores liked song IDs in a long-lived cookie.
 * This module stores the full song metadata so the Favorites page can
 * display title, artist, thumbnail after a page reload.
 */

const STORE_KEY = "aura_favorites_meta";

export interface FavoriteSong {
  songId: string;
  title: string;
  artist: string;
  thumbnailUrl?: string;
  youtubeVideoId: string;
}

function readStore(): FavoriteSong[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as FavoriteSong[];
  } catch {
    return [];
  }
}

function writeStore(songs: FavoriteSong[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(songs));
  } catch {}
}

/** Return all stored favorite songs */
export function getFavoritesMeta(): FavoriteSong[] {
  return readStore();
}

/** Add or update a song in favorites metadata */
export function upsertFavorite(song: FavoriteSong) {
  const list = readStore();
  const idx = list.findIndex((s) => s.songId === song.songId);
  if (idx >= 0) {
    list[idx] = song;
  } else {
    list.unshift(song); // newest first
  }
  writeStore(list);
}

/** Remove a song from favorites metadata */
export function removeFavorite(songId: string) {
  const list = readStore().filter((s) => s.songId !== songId);
  writeStore(list);
}

/** Check if a song is in the local metadata store */
export function isFavoriteLocal(songId: string): boolean {
  return readStore().some((s) => s.songId === songId);
}

/**
 * Sync the local metadata list against liked IDs from the server.
 * Removes any songs not present in likedIds array.
 */
export function syncFavoriteMeta(likedIds: string[]) {
  const set = new Set(likedIds);
  const filtered = readStore().filter((s) => set.has(s.songId));
  writeStore(filtered);
}
